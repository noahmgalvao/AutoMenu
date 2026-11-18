import { resolveStorageFileUrl, resolveAssetMapForIds, uploadPublicationPdf, uploadPortablePublication } from '../assets';
import type { MenuPublication, Workspace, Menu } from '../../../domain/workspace/model';
import type { Product, MenuStyle, SortOption } from '../../../domain/menu/model';
import { getSupabaseClient } from '../client';
import { isMissingSchemaObjectError } from './schemaCompatibility';
import { readPortablePublication, savePortablePublication, readPortablePublicationBySlug } from '../../browser/portablePublicationCache';
import { mapPublicationRow } from './rowMapping';
import { getErrorMessage } from '../../../application/errorMessages';
import {
  createEditorState,
  createRenderSnapshot,
  getMenuContentSignature,
  slugify,
  normalizePersistedProducts,
  withStyleDefaults,
  DEFAULT_SORT_OPTION,
} from '../../../application/workspace/state';
import { insertMenuVersionWithRetry, hydrateSnapshot } from './revisions';
import { collectStyleAssetIds, collectProductAssetIds } from './assetReferences';
import { INITIAL_STYLE } from '../../../domain/menu/defaults';

const resolvePublicationPdfUrl = async (row: any) => {
  if (row?.pdf_bucket && row?.pdf_path) {
    return resolveStorageFileUrl(row.pdf_bucket, row.pdf_path);
  }
  if (!row?.pdf_asset_id) return null;
  const urls = await resolveAssetMapForIds(row.workspace_id, [row.pdf_asset_id]);
  return urls.get(row.pdf_asset_id) || null;
};

export const getMenuPublication = async (menuId: string): Promise<MenuPublication | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_publications')
    .select('*')
    .eq('menu_id', menuId)
    .maybeSingle();
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) return readPortablePublication(menuId);
  if (error) throw error;
  if (!data) return null;
  return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
};

export const publishWorkspaceMenu = async ({
  workspace,
  menu,
  userId,
  products,
  style,
  sortOption,
  pdfBlob,
  pdfFilename,
  pdfOptions,
}: {
  workspace: Workspace;
  menu: Menu;
  userId: string;
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
  pdfBlob: Blob;
  pdfFilename: string;
  pdfOptions: Record<string, unknown>;
}): Promise<MenuPublication> => {
  const supabase = getSupabaseClient();
  const runStep = async <T,>(label: string, action: () => Promise<T>) => {
    try {
      return await action();
    } catch (error) {
      throw new Error(`${label}: ${getErrorMessage(error, 'erro inesperado')}`);
    }
  };
  const releaseId = crypto.randomUUID();
  let publicationTableAvailable = true;
  let existing: MenuPublication | null = null;
  const publicationLookup = await supabase
    .from('menu_publications')
    .select('*')
    .eq('menu_id', menu.id)
    .maybeSingle();
  if (publicationLookup.error && isMissingSchemaObjectError(publicationLookup.error, 'menu_publications')) {
    publicationTableAvailable = false;
    existing = readPortablePublication(menu.id);
  } else if (publicationLookup.error) {
    throw new Error(`Falha ao consultar a publicação: ${getErrorMessage(publicationLookup.error, 'erro inesperado')}`);
  } else {
    existing = publicationLookup.data ? mapPublicationRow(publicationLookup.data) : null;
  }
  const uploaded = await runStep('Falha ao enviar o PDF', () => uploadPublicationPdf({
    workspaceId: workspace.id,
    menuId: menu.id,
    releaseId,
    file: new File([pdfBlob], pdfFilename, { type: 'application/pdf' }),
  }));

  const editorState = createEditorState(style, products.filter((product) => product.isFreeText), sortOption);
  const renderSnapshot = createRenderSnapshot(products, style, sortOption);
  const { versionId } = await runStep('Falha ao criar a versão publicada', () => insertMenuVersionWithRetry({
    menuId: menu.id,
    userId,
    editorState,
    renderSnapshot,
    versionType: 'published',
    actionLabel: 'Cardápio publicado',
  }));
  const contentSignature = getMenuContentSignature(products, style, sortOption);
  const baseSlug = slugify(menu.name);
  const uniqueBaseSlug = `${baseSlug}-${menu.id.slice(0, 8)}`;

  if (!publicationTableAvailable) {
    const now = new Date().toISOString();
    const portableBase: MenuPublication = {
      id: existing?.id || crypto.randomUUID(),
      menuId: menu.id,
      workspaceId: workspace.id,
      restaurantSlug: workspace.slug,
      menuSlug: existing?.menuSlug || uniqueBaseSlug,
      publishedVersionId: versionId,
      pdfAssetId: null,
      pdfBucket: uploaded.bucket,
      pdfPath: uploaded.path,
      pdfUrl: uploaded.url,
      pdfFilename,
      pdfOptions,
      snapshot: renderSnapshot,
      contentSignature,
      portableSnapshotUrl: null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const portableFile = await runStep('Falha ao criar o link público', () => uploadPortablePublication({
      workspaceId: workspace.id,
      menuId: menu.id,
      releaseId,
      publication: { publication: portableBase },
    }));
    const portablePublication = { ...portableBase, portableSnapshotUrl: portableFile.url };
    const { error: menuUpdateError } = await supabase
      .from('menus')
      .update({ published_version_id: versionId, status: 'published' })
      .eq('id', menu.id);
    if (menuUpdateError) throw new Error(`Falha ao concluir a publicação: ${getErrorMessage(menuUpdateError, 'erro inesperado')}`);
    savePortablePublication(portablePublication);
    return portablePublication;
  }

  const assetIds = collectStyleAssetIds(style);
  collectProductAssetIds(products).forEach((assetId) => assetIds.add(assetId));

  const { error: menuUpdateError } = await supabase
    .from('menus')
    .update({ published_version_id: versionId, status: 'published' })
    .eq('id', menu.id);
  if (menuUpdateError) throw new Error(`Falha ao concluir a publicação: ${getErrorMessage(menuUpdateError, 'erro inesperado')}`);

  let publicationRow: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const menuSlug = existing?.menuSlug || (attempt === 0 ? uniqueBaseSlug : `${uniqueBaseSlug}-${attempt + 1}`);
    const payload = {
      id: existing?.id || crypto.randomUUID(),
      menu_id: menu.id,
      workspace_id: workspace.id,
      restaurant_slug: workspace.slug,
      menu_slug: menuSlug,
      published_version_id: versionId,
      pdf_asset_id: null,
      pdf_bucket: uploaded.bucket,
      pdf_path: uploaded.path,
      pdf_filename: pdfFilename,
      pdf_options: pdfOptions,
      snapshot: renderSnapshot,
      asset_ids: Array.from(assetIds),
      content_signature: contentSignature,
    };
    const { data, error } = await supabase
      .from('menu_publications')
      .upsert(payload, { onConflict: 'menu_id' })
      .select('*')
      .single();
    if (!error) {
      publicationRow = data;
      break;
    }
    lastError = error;
    if (existing || error.code !== '23505') {
      throw new Error(`Falha ao salvar o link público: ${getErrorMessage(error, 'erro inesperado')}`);
    }
  }
  if (!publicationRow) throw lastError || new Error('Não foi possível criar o link público.');

  return mapPublicationRow(publicationRow, uploaded.url);
};

export const loadPublicMenuPublication = async ({
  restaurantSlug,
  menuSlug,
  portableSnapshotUrl,
}: {
  restaurantSlug: string;
  menuSlug: string;
  portableSnapshotUrl?: string | null;
}): Promise<{
  publication: MenuPublication;
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
} | null> => {
  if (portableSnapshotUrl) {
    const response = await fetch(portableSnapshotUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('O link público expirou ou está indisponível. Publique o cardápio novamente.');
    const payload = await response.json() as { publication?: MenuPublication };
    if (!payload.publication?.pdfUrl || !payload.publication.workspaceId) throw new Error('Publicação inválida.');
    const publication: MenuPublication = {
      ...payload.publication,
      restaurantSlug,
      menuSlug,
      portableSnapshotUrl,
    };
    const snapshot = publication.snapshot || {};
    return {
      publication,
      products: normalizePersistedProducts(snapshot.products),
      style: withStyleDefaults((snapshot.style as MenuStyle | undefined) || INITIAL_STYLE),
      sortOption: (snapshot.sortOption || DEFAULT_SORT_OPTION) as SortOption,
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_publications')
    .select('*')
    .eq('restaurant_slug', restaurantSlug)
    .eq('menu_slug', menuSlug)
    .maybeSingle();
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) {
    const portable = readPortablePublicationBySlug(restaurantSlug, menuSlug);
    return portable
      ? loadPublicMenuPublication({ restaurantSlug, menuSlug, portableSnapshotUrl: portable.portableSnapshotUrl })
      : null;
  }
  if (error) throw error;
  if (!data) return null;
  const hydrated = await hydrateSnapshot(data.workspace_id, data.snapshot || {});
  return {
    publication: mapPublicationRow(data, await resolvePublicationPdfUrl(data)),
    ...hydrated,
  };
};

export const updatePublicationMenuSlug = async ({
  publicationId,
  menuSlug,
}: {
  publicationId: string;
  menuSlug: string;
}) => {
  const supabase = getSupabaseClient();
  const normalizedSlug = slugify(menuSlug);
  const { data, error } = await supabase
    .from('menu_publications')
    .update({ menu_slug: normalizedSlug })
    .eq('id', publicationId)
    .select('*')
    .single();
  if (error?.code === '23505') throw new Error('Este endereço já está em uso. Escolha outro nome.');
  if (error) throw error;
  return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
};

export const canEditPublishedMenu = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('workspace_members')
    .select('workspace_id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) return false;
  return Boolean(count);
};
