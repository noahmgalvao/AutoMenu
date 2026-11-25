import { resolveStorageFileUrl, resolveAssetMapForIds, uploadPortablePublication } from '../assets';
import type { MenuPublication } from '../../../domain/workspace/model';
import type { PublicationAddress, PublicationAvailability, PublicationGateway } from '../../../application/publishing/publicationGateway';
import { getSupabaseClient } from '../client';
import { isMissingSchemaObjectError } from './schemaCompatibility';
import { readPortablePublication, readPortablePublicationBySlug, savePortablePublication } from '../../browser/portablePublicationCache';
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

const readPublicRow = ({ restaurantSlug, menuSlug }: PublicationAddress) => getSupabaseClient()
  .from('menu_publications').select('*').eq('restaurant_slug', restaurantSlug).eq('menu_slug', menuSlug).abortSignal(AbortSignal.timeout(4000)).maybeSingle();

async function confirmPublishedAddress(restaurantSlug: string, menuSlug: string, menuId: string) {
  const { data, error } = await readPublicRow({ restaurantSlug, menuSlug });
  if (error) throw error;
  if (!data || data.menu_id !== menuId) throw new Error('Não foi possível confirmar o endereço publicado.');
  return mapPublicationRow(data);
}

async function readStoredPublication(source: string) {
  const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error('Não foi possível verificar o link público.');
  const { publication } = await response.json() as { publication?: MenuPublication };
  return publication?.workspaceId && (publication.pdfUrl || Array.isArray(publication.snapshot?.products)) ? publication : null;
}

async function writePortablePublication(publication: MenuPublication, source?: string | null) {
  const releaseId = source && new URL(source).pathname.match(/\/([\w-]+)\.json$/)?.[1];
  const file = await uploadPortablePublication({
    workspaceId: publication.workspaceId, menuId: publication.menuId, releaseId: releaseId || crypto.randomUUID(),
    publication: { publication }, existingUrl: releaseId ? source : null,
  });
  const result = { ...publication, portableSnapshotUrl: file.url };
  savePortablePublication({ ...result, snapshot: {} });
  return result;
}

export const getMenuPublication: PublicationGateway['getMenuPublication'] = async menuId => {
  const { data, error } = await lookupPublication(menuId);
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) return readPortablePublication(menuId);
  if (error) throw error;
  return data ? mapPublicationRow(data) : readPortablePublication(menuId);
};

export const publishWorkspaceMenu: PublicationGateway['publishWorkspaceMenu'] = async ({
  workspace, menu, userId, products, style, sortOption, menuSlug: requestedSlug,
}) => {
  const supabase = getSupabaseClient();
  const customSlug = requestedSlug && normalizePublicationSlug(requestedSlug);
  const contentSignature = getMenuContentSignature(products, style, sortOption);
  const defaultSlug = getDefaultPublicationSlug(menu.name);
  const pdfFilename = `${menu.name || 'cardapio'}.pdf`;

  const { data, error: lookupError } = await lookupPublication(menu.id);
  const useStorage = Boolean(lookupError && isMissingSchemaObjectError(lookupError, 'menu_publications'));
  if (lookupError && !useStorage) throw lookupError;
  const existing = data ? mapPublicationRow(data) : null;
  const portable = existing ? null : readPortablePublication(menu.id);
  const preferredSlug = customSlug || existing?.menuSlug || portable?.menuSlug;
  const restaurantSlug = existing?.restaurantSlug ?? portable?.restaurantSlug ?? workspace.slug;
  const candidates = preferredSlug ? [preferredSlug] :
    [defaultSlug, ...Array.from({ length: 7 }, (_, index) => `${defaultSlug}-${index + 2}`)];
  const addressTaken = () => new Error('Este endereço já está em uso. Escolha outro nome.');
  const noAddressAvailable = () => new Error('Não foi possível criar um endereço disponível.');

  if (!useStorage && preferredSlug && existing?.menuSlug !== preferredSlug) {
    const { data: occupied, error } = await readPublicRow({ restaurantSlug, menuSlug: preferredSlug });
    if (error) throw error;
    if (occupied && occupied.menu_id !== menu.id) throw addressTaken();

    if (existing?.contentSignature === contentSignature) {
      const { error: updateError } = await supabase.from('menu_publications').update({ menu_slug: preferredSlug })
        .eq('id', existing.id).eq('menu_slug', existing.menuSlug).eq('published_version_id', existing.publishedVersionId);
      if (updateError?.code === '23505') throw addressTaken();
      if (updateError) throw updateError;
      return confirmPublishedAddress(restaurantSlug, preferredSlug, menu.id);
    }
  }

  const storageSlug = useStorage ? candidates.find(slug => {
    const occupied = readPortablePublicationBySlug(restaurantSlug, slug);
    return !occupied || occupied.menuId === menu.id;
  }) : undefined;
  if (useStorage && !storageSlug) throw preferredSlug ? addressTaken() : noAddressAvailable();
  if (storageSlug && portable?.portableSnapshotUrl && portable.menuSlug !== storageSlug) {
    const stored = await readStoredPublication(portable.portableSnapshotUrl);
    if (stored?.menuId === menu.id && stored.contentSignature === contentSignature) {
      return writePortablePublication({ ...stored, menuSlug: storageSlug, updatedAt: new Date().toISOString() }, portable.portableSnapshotUrl);
    }
  }

  const renderSnapshot = createRenderSnapshot(products, style, sortOption);
  const editorState = createEditorState(style, products.filter(product => product.isFreeText), sortOption);
  const { versionId } = await insertMenuVersionWithRetry({
    menuId: menu.id, userId, editorState, renderSnapshot, versionType: 'published', actionLabel: 'Cardápio publicado',
  });
  const updateMenu = () => supabase.from('menus').update({ published_version_id: versionId, status: 'published' }).eq('id', menu.id).neq('status', 'archived');

  if (storageSlug) {
    const now = new Date().toISOString();
    const publication: MenuPublication = {
      id: portable?.id || crypto.randomUUID(),
      menuId: menu.id, workspaceId: workspace.id, restaurantSlug,
      menuSlug: storageSlug,
      publishedVersionId: versionId, pdfAssetId: null, pdfBucket: 'menu-assets', pdfPath: null,
      pdfUrl: null, pdfFilename, pdfOptions: {}, snapshot: renderSnapshot, contentSignature,
      portableSnapshotUrl: null, createdAt: portable?.createdAt || now, updatedAt: now,
    };
    const result = await writePortablePublication(publication, portable?.portableSnapshotUrl);
    void updateMenu().then(() => undefined, () => undefined);
    return result;
  }

  const assetIds = collectStyleAssetIds(style);
  collectProductAssetIds(products).forEach(id => assetIds.add(id));
  for (const slug of candidates) {
    const payload = {
      menu_id: menu.id, workspace_id: workspace.id, restaurant_slug: restaurantSlug, menu_slug: slug,
      published_version_id: versionId, pdf_asset_id: null, pdf_bucket: 'menu-assets', pdf_path: null,
      pdf_filename: pdfFilename, pdf_options: {}, snapshot: renderSnapshot,
      asset_ids: Array.from(assetIds), content_signature: contentSignature,
    };
    const table = supabase.from('menu_publications');
    // A first insert must finish before the public read policy can see the new row.
    const { error } = existing
      ? await table.update(payload).eq('id', existing.id)
      : await table.insert(payload);
    if (!error) {
      const published = await confirmPublishedAddress(restaurantSlug, slug, menu.id);
      if (published.publishedVersionId === versionId) void updateMenu().then(() => undefined, () => undefined);
      return published;
    }
    if (error.code === '23505' && !existing) {
      const { data: concurrent, error: lookupError } = await lookupPublication(menu.id);
      if (lookupError) throw lookupError;
      if (concurrent && (!customSlug || concurrent.menu_slug === customSlug)) {
        return confirmPublishedAddress(concurrent.restaurant_slug, concurrent.menu_slug, menu.id);
      }
    }
    if (error.code === '23505' && preferredSlug) throw addressTaken();
    if (error.code !== '23505') throw new Error(getErrorMessage(error, 'Falha ao salvar o link público.'));
  }
  throw noAddressAvailable();
};

export const loadPublicMenuPublication: PublicationGateway['loadPublicMenuPublication'] = async address => {
  if (address.portableSnapshotUrl) {
    const publication = await readStoredPublication(address.portableSnapshotUrl);
    if (!publication) return null;
    // Preserve already distributed portable links after the same address is republished.
    const { data } = await readPublicRow(address);
    if (data && data.menu_id === publication.menuId) return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
    return { ...publication, ...address, portableSnapshotUrl: address.portableSnapshotUrl };
  }
  const { data, error } = await readPublicRow(address);
  if (error && !isMissingSchemaObjectError(error, 'menu_publications')) throw error;
  if (data) return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
  const portable = readPortablePublicationBySlug(address.restaurantSlug, address.menuSlug);
  return portable ? loadPublicMenuPublication({ ...address, portableSnapshotUrl: portable.portableSnapshotUrl }) : null;
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
