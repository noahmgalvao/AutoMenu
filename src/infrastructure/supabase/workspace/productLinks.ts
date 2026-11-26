import { revisionOperationId } from '../../../application/revisions/operationId';
import { historyV12Enabled, revisionRequest } from '../../browser/revisionGateway';
import { getSupabaseClient } from '../client';
import { isMissingSchemaObjectError } from './schemaCompatibility';
import type { Product } from '../../../domain/menu/model';
import type { MenuEditorState, MenuProductSource, MenuProductSync } from '../../../domain/workspace/model';
import {
  normalizePersistedProducts,
  cloneJson,
  createEditorState,
  DEFAULT_SORT_OPTION,
  createRenderSnapshot,
  productComparisonSignature,
} from '../../../application/workspace/state';
import { insertMenuVersionWithRetry, loadMenuRevisionState } from './revisions';
import { listWorkspaceMenus } from './menus';
import { mapMenuRow } from './rowMapping';

type ProductSyncLinkRow = { target_menu_id: string; product_id: string };

const loadProductSyncLinks = async (
  workspaceId: string,
  sourceMenuId: string,
): Promise<ProductSyncLinkRow[]> => {
  const supabase = getSupabaseClient();
  const pairwiseResult = await supabase
    .from('menu_product_sync_links')
    .select('target_menu_id, product_id')
    .eq('workspace_id', workspaceId)
    .eq('source_menu_id', sourceMenuId);

  if (!pairwiseResult.error) return pairwiseResult.data || [];
  if (!isMissingSchemaObjectError(pairwiseResult.error, 'menu_product_sync_links')) {
    throw pairwiseResult.error;
  }

  const sourceResult = await supabase
    .from('menu_synced_products')
    .select('product_id')
    .eq('workspace_id', workspaceId)
    .eq('menu_id', sourceMenuId);
  if (sourceResult.error) {
    if (isMissingSchemaObjectError(sourceResult.error, 'menu_synced_products')) return [];
    throw sourceResult.error;
  }

  const productIds = Array.from(new Set((sourceResult.data || []).map(row => row.product_id)));
  if (productIds.length === 0) return [];

  const targetResult = await supabase
    .from('menu_synced_products')
    .select('menu_id, product_id')
    .eq('workspace_id', workspaceId)
    .in('product_id', productIds)
    .neq('menu_id', sourceMenuId);
  if (targetResult.error) {
    if (isMissingSchemaObjectError(targetResult.error, 'menu_synced_products')) return [];
    throw targetResult.error;
  }

  return (targetResult.data || []).map(row => ({
    target_menu_id: row.menu_id,
    product_id: row.product_id,
  }));
};

export const propagateSyncedProducts = async ({
  workspaceId,
  sourceMenuId,
  sourceMenuName,
  userId,
  sourceProducts,
}: {
  workspaceId: string;
  sourceMenuId: string;
  sourceMenuName: string;
  userId: string;
  sourceProducts: Product[];
}) => {
  const supabase = getSupabaseClient();
  const sourceLinks = await loadProductSyncLinks(workspaceId, sourceMenuId);

  const targetLinks = new Map<string, Set<string>>();
  sourceLinks.forEach((row) => {
    const ids = targetLinks.get(row.target_menu_id) || new Set<string>();
    ids.add(row.product_id);
    targetLinks.set(row.target_menu_id, ids);
  });
  if (targetLinks.size === 0) return;

  const { data: targetMenus, error: targetMenusError } = await supabase
    .from('menus')
    .select('*')
    .in('id', Array.from(targetLinks.keys()))
    .neq('status', 'archived');
  if (targetMenusError) throw targetMenusError;

  const sourceById = new Map(sourceProducts.filter((product) => !product.isFreeText).map((product) => [product.id, product]));
  await Promise.all((targetMenus || []).map(async (targetMenuRow) => {
    if (!targetMenuRow.current_draft_version_id) return;
    const { data: targetVersion, error: targetVersionError } = await supabase
      .from('menu_versions')
      .select('*')
      .eq('id', targetMenuRow.current_draft_version_id)
      .single();
    if (targetVersionError) throw targetVersionError;

    const linkedIds = targetLinks.get(targetMenuRow.id) || new Set<string>();
    const currentProducts = normalizePersistedProducts(targetVersion.render_snapshot?.products);
    const presentIds = new Set<string>();
    const nextProducts = currentProducts.flatMap((product) => {
      if (!linkedIds.has(product.id)) return [product];
      const sourceProduct = sourceById.get(product.id);
      if (!sourceProduct) return [];
      presentIds.add(product.id);
      return [cloneJson(sourceProduct)];
    });
    linkedIds.forEach((productId) => {
      const sourceProduct = sourceById.get(productId);
      if (sourceProduct && !presentIds.has(productId)) nextProducts.push(cloneJson(sourceProduct));
    });

    const editorState = targetVersion.editor_state as MenuEditorState;
    const nextEditorState = createEditorState(
      editorState.style,
      nextProducts.filter((product) => product.isFreeText),
      editorState.sortOption || DEFAULT_SORT_OPTION,
    );
    const nextSnapshot = createRenderSnapshot(
      nextProducts,
      editorState.style,
      editorState.sortOption || DEFAULT_SORT_OPTION,
    );
    if (historyV12Enabled()) {
      await revisionRequest('save',{menuId:targetMenuRow.id,expectedWrite:Number(targetMenuRow.revision_write_version||0),operationId:revisionOperationId(),editor:nextEditorState,snapshot:nextSnapshot,actionLabel:`Produtos vinculados ao cardápio ${sourceMenuName}`});
      return;
    }
    const { versionId } = await insertMenuVersionWithRetry({
      menuId: targetMenuRow.id,
      userId,
      editorState: nextEditorState,
      renderSnapshot: nextSnapshot,
      actionLabel: `Produtos vinculados ao cardápio ${sourceMenuName}`,
    });
    const { error: updateTargetError } = await supabase
      .from('menus')
      .update({ current_draft_version_id: versionId, status: 'draft' })
      .eq('id', targetMenuRow.id);
    if (updateTargetError) throw updateTargetError;
  }));
};

export const listMenuProductSources = async ({
  workspaceId,
  currentMenuId,
  currentProducts,
}: {
  workspaceId: string;
  currentMenuId: string;
  currentProducts: Product[];
}): Promise<MenuProductSource[]> => {
  const menus = await listWorkspaceMenus(workspaceId);
  const currentSignature = productComparisonSignature(currentProducts);
  const sources = await Promise.all(menus.filter((menu) => menu.id !== currentMenuId).map(async (menu) => {
    if (!menu.currentDraftVersionId) return null;
    const state = await loadMenuRevisionState({ workspaceId, versionId: menu.currentDraftVersionId });
    const products = state.products.filter((product) => !product.isFreeText);
    if (products.length === 0 || productComparisonSignature(products) === currentSignature) return null;
    return { menu, products } satisfies MenuProductSource;
  }));
  return sources.filter(Boolean) as MenuProductSource[];
};

export const linkSyncedMenuProducts = async ({
  workspaceId,
  sourceMenuId,
  targetMenuId,
  productIds,
}: {
  workspaceId: string;
  sourceMenuId: string;
  targetMenuId: string;
  productIds: string[];
}) => {
  const uniqueIds = Array.from(new Set(productIds));
  if (uniqueIds.length === 0) return;
  const supabase = getSupabaseClient();
  const rows = uniqueIds.flatMap((productId) => [
    { workspace_id: workspaceId, source_menu_id: sourceMenuId, target_menu_id: targetMenuId, product_id: productId },
    { workspace_id: workspaceId, source_menu_id: targetMenuId, target_menu_id: sourceMenuId, product_id: productId },
  ]);
  const { error } = await supabase.from('menu_product_sync_links').upsert(rows, { onConflict: 'source_menu_id,target_menu_id,product_id' });
  if (!error) return;
  if (!isMissingSchemaObjectError(error, 'menu_product_sync_links')) throw error;

  const legacyRows = uniqueIds.flatMap((productId) => [
    { workspace_id: workspaceId, menu_id: sourceMenuId, product_id: productId },
    { workspace_id: workspaceId, menu_id: targetMenuId, product_id: productId },
  ]);
  const legacyResult = await supabase
    .from('menu_synced_products')
    .upsert(legacyRows, { onConflict: 'menu_id,product_id' });
  if (legacyResult.error && !isMissingSchemaObjectError(legacyResult.error, 'menu_synced_products')) {
    throw legacyResult.error;
  }
};

export const listMenuProductSyncs = async ({
  workspaceId,
  currentMenuId,
}: {
  workspaceId: string;
  currentMenuId: string;
}): Promise<MenuProductSync[]> => {
  const supabase = getSupabaseClient();
  const links = await loadProductSyncLinks(workspaceId, currentMenuId);

  const counts = new Map<string, Set<string>>();
  links.forEach((link) => {
    const productIds = counts.get(link.target_menu_id) || new Set<string>();
    productIds.add(link.product_id);
    counts.set(link.target_menu_id, productIds);
  });
  if (counts.size === 0) return [];

  const { data: menus, error: menusError } = await supabase
    .from('menus')
    .select('*')
    .in('id', Array.from(counts.keys()))
    .neq('status', 'archived');
  if (menusError) throw menusError;

  return (menus || []).map((menuRow) => ({
    menu: mapMenuRow(menuRow),
    productCount: counts.get(menuRow.id)?.size || 0,
  }));
};

export const unlinkSyncedMenuProducts = async ({
  workspaceId,
  sourceMenuId,
  targetMenuId,
}: {
  workspaceId: string;
  sourceMenuId: string;
  targetMenuId: string;
}) => {
  const supabase = getSupabaseClient();
  const directions = [
    [sourceMenuId, targetMenuId],
    [targetMenuId, sourceMenuId],
  ] as const;
  const results = await Promise.all(directions.map(([sourceId, targetId]) => (
    supabase
      .from('menu_product_sync_links')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('source_menu_id', sourceId)
      .eq('target_menu_id', targetId)
  )));
  const error = results.find((result) => result.error)?.error;
  if (!error) return;
  if (!isMissingSchemaObjectError(error, 'menu_product_sync_links')) throw error;

  const legacyLinksResult = await supabase
    .from('menu_synced_products')
    .select('menu_id, product_id')
    .eq('workspace_id', workspaceId)
    .in('menu_id', [sourceMenuId, targetMenuId]);
  if (legacyLinksResult.error) {
    if (isMissingSchemaObjectError(legacyLinksResult.error, 'menu_synced_products')) return;
    throw legacyLinksResult.error;
  }

  const productsByMenu = new Map<string, Set<string>>();
  (legacyLinksResult.data || []).forEach(row => {
    const ids = productsByMenu.get(row.menu_id) || new Set<string>();
    ids.add(row.product_id);
    productsByMenu.set(row.menu_id, ids);
  });
  const sourceIds = productsByMenu.get(sourceMenuId) || new Set<string>();
  const targetIds = productsByMenu.get(targetMenuId) || new Set<string>();
  const sharedProductIds = Array.from(sourceIds).filter(productId => targetIds.has(productId));
  if (sharedProductIds.length === 0) return;

  const legacyDeleteResult = await supabase
    .from('menu_synced_products')
    .delete()
    .eq('workspace_id', workspaceId)
    .in('menu_id', [sourceMenuId, targetMenuId])
    .in('product_id', sharedProductIds);
  if (legacyDeleteResult.error && !isMissingSchemaObjectError(legacyDeleteResult.error, 'menu_synced_products')) {
    throw legacyDeleteResult.error;
  }
};
