import { resolveStorageFileUrl, resolveAssetMapForIds, uploadPortablePublication } from '../assets';
import type { MenuPublication } from '../../../domain/workspace/model';
import type { PublicationAddress, PublicationAvailability, PublicationGateway } from '../../../application/publishing/publicationGateway';
import { getSupabaseClient } from '../client';
import { isMissingSchemaObjectError } from './schemaCompatibility';
import { readPortablePublication, savePortablePublication, readPortablePublicationBySlug } from '../../browser/portablePublicationCache';
import { mapPublicationRow } from './rowMapping';
import { getErrorMessage } from '../../../application/errorMessages';
import { createEditorState, createRenderSnapshot, getMenuContentSignature } from '../../../application/workspace/state';
import { hydrateSnapshot, insertMenuVersionWithRetry } from './revisions';
import { collectStyleAssetIds, collectProductAssetIds } from './assetReferences';
import { getDefaultPublicationSlug, normalizePublicationSlug } from '../../../domain/publishing/publicationSlug';

const resolvePublicationPdfUrl = async (row: any) => {
  if (row.pdf_bucket && row.pdf_path) return resolveStorageFileUrl(row.pdf_bucket, row.pdf_path);
  if (!row.pdf_asset_id) return null;
  const urls = await resolveAssetMapForIds(row.workspace_id, [row.pdf_asset_id]);
  return urls.get(row.pdf_asset_id) || null;
};

const lookupPublication = (menuId: string) => getSupabaseClient()
  .from('menu_publications').select('*').eq('menu_id', menuId).maybeSingle();

export const getMenuPublication: PublicationGateway['getMenuPublication'] = async menuId => {
  const { data, error } = await lookupPublication(menuId);
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) return readPortablePublication(menuId);
  if (error) throw error;
  return data ? mapPublicationRow(data) : null;
};

export const publishWorkspaceMenu: PublicationGateway['publishWorkspaceMenu'] = async ({
  workspace, menu, userId, products, style, sortOption, menuSlug: requestedSlug,
}) => {
  const supabase = getSupabaseClient();
  const customSlug = requestedSlug && normalizePublicationSlug(requestedSlug);
  const renderSnapshot = createRenderSnapshot(products, style, sortOption);
  const contentSignature = getMenuContentSignature(products, style, sortOption);
  const editorState = createEditorState(style, products.filter(product => product.isFreeText), sortOption);
  const defaultSlug = getDefaultPublicationSlug(menu.name, menu.id);
  const pdfFilename = `${menu.name || 'cardapio'}.pdf`;

  const { data, error: lookupError } = await lookupPublication(menu.id);
  const portable = Boolean(lookupError && isMissingSchemaObjectError(lookupError, 'menu_publications'));
  if (lookupError && !portable) throw lookupError;
  const existing = portable ? readPortablePublication(menu.id) : data ? mapPublicationRow(data) : null;

  if (!portable && customSlug && existing?.menuSlug !== customSlug) {
    const { data: occupied, error } = await readPublicRow({ restaurantSlug: workspace.slug, menuSlug: customSlug });
    if (error) throw error;
    if (occupied && occupied.menu_id !== menu.id) throw new Error('Este endereço já está em uso. Escolha outro nome.');
  }

  const { versionId } = await insertMenuVersionWithRetry({
    menuId: menu.id, userId, editorState, renderSnapshot, versionType: 'published', actionLabel: 'Cardápio publicado',
  });
  const updateMenu = () => supabase.from('menus').update({ published_version_id: versionId, status: 'published' }).eq('id', menu.id).neq('status', 'archived');

  if (portable) {
    const now = new Date().toISOString();
    const base: MenuPublication = {
      id: existing?.id || crypto.randomUUID(),
      menuId: menu.id, workspaceId: workspace.id, restaurantSlug: workspace.slug,
      menuSlug: customSlug || existing?.menuSlug || defaultSlug,
      publishedVersionId: versionId, pdfAssetId: null, pdfBucket: 'menu-assets', pdfPath: null,
      pdfUrl: null, pdfFilename, pdfOptions: {}, snapshot: renderSnapshot, contentSignature,
      portableSnapshotUrl: null, createdAt: existing?.createdAt || now, updatedAt: now,
    };
    const source = existing?.portableSnapshotUrl;
    const releaseId = source && new URL(source).pathname.match(/\/([\w-]+)\.json$/)?.[1];
    const file = await uploadPortablePublication({
      workspaceId: workspace.id, menuId: menu.id, releaseId: releaseId || crypto.randomUUID(),
      publication: { publication: base }, existingUrl: releaseId ? source : null,
    });
    const result = { ...base, portableSnapshotUrl: file.url };
    await updateMenu();
    savePortablePublication(result);
    return result;
  }

  const assetIds = collectStyleAssetIds(style);
  collectProductAssetIds(products).forEach(id => assetIds.add(id));
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = customSlug || existing?.menuSlug || (attempt === 0 ? defaultSlug : `${defaultSlug}-${attempt + 1}`);
    const payload = {
      ...(existing ? { id: existing.id } : {}),
      menu_id: menu.id, workspace_id: workspace.id, restaurant_slug: workspace.slug, menu_slug: slug,
      published_version_id: versionId, pdf_asset_id: null, pdf_bucket: 'menu-assets', pdf_path: null,
      pdf_filename: pdfFilename, pdf_options: {}, snapshot: renderSnapshot,
      asset_ids: Array.from(assetIds), content_signature: contentSignature,
    };
    // Verify in a separate request, after the public read policy can see the new row.
    const { error } = await supabase.from('menu_publications').upsert(payload, { onConflict: 'menu_id' });
    if (!error) {
      const { data: published, error: verificationError } = await readPublicRow({
        restaurantSlug: workspace.slug, menuSlug: slug,
      });
      if (verificationError) throw verificationError;
      if (!published || published.menu_id !== menu.id) throw new Error('Não foi possível confirmar o endereço publicado.');
      if (published.published_version_id === versionId) void updateMenu().then(() => undefined, () => undefined);
      return mapPublicationRow(published);
    }
    if (error.code === '23505' && customSlug) throw new Error('Este endereço já está em uso. Escolha outro nome.');
    if (existing || error.code !== '23505') throw new Error(getErrorMessage(error, 'Falha ao salvar o link público.'));
  }
  throw new Error('Não foi possível criar um endereço disponível.');
};

const readPublicRow = ({ restaurantSlug, menuSlug }: PublicationAddress) => getSupabaseClient()
  .from('menu_publications').select('*').eq('restaurant_slug', restaurantSlug).eq('menu_slug', menuSlug).abortSignal(AbortSignal.timeout(4000)).maybeSingle();

export const loadPublicMenuPublication: PublicationGateway['loadPublicMenuPublication'] = async address => {
  if (address.portableSnapshotUrl) {
    const response = await fetch(address.portableSnapshotUrl, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new Error('Não foi possível verificar o link público.');
    const payload = await response.json() as { publication?: MenuPublication };
    const publication = payload.publication;
    if (!publication?.workspaceId || (!publication.pdfUrl && !Array.isArray(publication.snapshot?.products))) return null;
    return { ...publication, ...address, portableSnapshotUrl: address.portableSnapshotUrl };
  }
  const { data, error } = await readPublicRow(address);
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) {
    const portable = readPortablePublicationBySlug(address.restaurantSlug, address.menuSlug);
    return portable ? loadPublicMenuPublication({ ...address, portableSnapshotUrl: portable.portableSnapshotUrl }) : null;
  }
  if (error) throw error;
  if (!data) return null;
  return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
};

export const verifyPublicMenuPublication: PublicationGateway['verifyPublicMenuPublication'] = async address => {
  const publication = await loadPublicMenuPublication(address);
  if (!publication) return { availability: 'offline' };
  let availability: PublicationAvailability = 'online';
  if (publication.pdfUrl) {
    const response = await fetch(publication.pdfUrl, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (response.status === 404 || response.status === 410) availability = 'offline';
    else if (!response.ok) availability = 'unknown';
  } else if (publication.pdfPath || publication.pdfAssetId) {
    availability = 'unknown';
  } else if (!Array.isArray(publication.snapshot?.products) || !publication.snapshot?.style) {
    availability = 'offline';
  }
  return { availability, contentSignature: publication.contentSignature };
};

export const loadPublishedContent: PublicationGateway['loadPublishedContent'] = publication => {
  // Portable snapshots already contain the asset URLs captured at release.
  if (publication.portableSnapshotUrl) return Promise.resolve({
    products: publication.snapshot.products, style: publication.snapshot.style, sortOption: publication.snapshot.sortOption,
  } as Awaited<ReturnType<PublicationGateway['loadPublishedContent']>>);
  return hydrateSnapshot(publication.workspaceId, publication.snapshot);
};
