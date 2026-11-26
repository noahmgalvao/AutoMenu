import { revisionOperationId } from '../../../application/revisions/operationId';
import { categoryName, categoryInstanceSlug, storedCategoryKey } from '../../../domain/menu/categoryName';
import type { Product, MenuStyle, SortOption } from '../../../domain/menu/model';
import type { SaveWorkspaceResult, MenuVersion } from '../../../domain/workspace/model';
import { getSupabaseClient } from '../client';
import { mapCategoryRow, mapMenuRow } from './rowMapping';
import {
  slugify,
  assignCategoryIds,
  withStyleDefaults,
  createEditorState,
  createRenderSnapshot,
  describeRevisionChange,
  mergeTemplates,
} from '../../../application/workspace/state';
import { normalizeProductAssets, normalizeStyleAssets } from './assetReferences';
import { syncWorkspaceTemplates } from './templates';
import { historyV12Enabled, revisionRequest } from '../../browser/revisionGateway';
import { mapMenuVersionRow } from './rowMapping';
import { roundPrice } from '../../../domain/menu/price';
import { resolveActiveMenu } from './menus';
import { insertMenuVersionWithRetry } from './revisions';
import { propagateSyncedProducts } from './productLinks';

const resolveCategoriesForSave = async (
  workspaceId: string,
  products: Product[],
  categoryOrder: string[],
) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    throw error;
  }

  const existingCategories = (data || []).map(mapCategoryRow);
  const existingById = new Map(existingCategories.map((category) => [category.id, category]));
  const grouped = new Map<string, Product[]>();

  products.forEach((product) => {
    const current = grouped.get(product.category) || [];
    current.push(product);
    grouped.set(product.category, current);
  });

  const orderedNames = Array.from(new Set([
    ...categoryOrder.filter((category) => grouped.has(category)),
    ...Array.from(grouped.keys()).filter((category) => !categoryOrder.includes(category)).sort((a, b) => a.localeCompare(b)),
  ]));

  const usedCategoryIds = new Set<string>();
  const categoriesForSave = orderedNames.map((key, index) => {
    const categoryProducts = grouped.get(key) || [];
    const candidateIds = categoryProducts
      .map((product) => product.categoryId)
      .filter((value): value is string => Boolean(value && existingById.has(value)));

    const chosenId =
      candidateIds.find((categoryId) => !usedCategoryIds.has(categoryId)) ||
      existingCategories.find((category) => storedCategoryKey(category) === key && !usedCategoryIds.has(category.id))?.id ||
      crypto.randomUUID();

    usedCategoryIds.add(chosenId);

    return {
      id: chosenId,
      workspace_id: workspaceId,
      name: categoryName(key),
      position: index,
      is_active: true,
    };
  });

  const existingSlugOwners = new Map(existingCategories.map((category) => [category.slug, category.id]));
  const usedSlugs = new Set<string>();
  const categoryRows = categoriesForSave.map((category, index) => {
    const baseSlug = categoryInstanceSlug(orderedNames[index]) ?? slugify(category.name);
    let slug = baseSlug;
    let suffix = 2;

    while (
      usedSlugs.has(slug) ||
      (existingSlugOwners.has(slug) && existingSlugOwners.get(slug) !== category.id)
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(slug);
    return { ...category, slug };
  });

  const categoryIdByName = new Map(categoryRows.map((row, index) => [orderedNames[index], row.id]));
  const normalizedProducts = products.map((product) => ({
    ...product,
    categoryId: categoryIdByName.get(product.category) || product.categoryId || null,
  }));

  return {
    existingCategories,
    categoryRows,
    normalizedProducts,
  };
};

export const saveWorkspaceState = async ({
  workspaceId,
  userId,
  menuId,
  products,
  style,
  templates,
  sortOption,
  expectedWrite, operationId,
  actionLabel = 'Alteração salva',
}: {
  workspaceId: string;
  userId: string;
  menuId?: string | null;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  actionLabel?: string;
  expectedWrite?: number; operationId?: string;
}): Promise<SaveWorkspaceResult> => {
  const supabase = getSupabaseClient();
  const normalizedProducts = await normalizeProductAssets(workspaceId, userId, assignCategoryIds(products));
  const normalizedStyle = await normalizeStyleAssets(workspaceId, userId, withStyleDefaults(style));
  const normalizedTemplates = await syncWorkspaceTemplates(workspaceId, userId, templates);

  const catalogProducts = normalizedProducts.filter((product) => !product.isFreeText);
  const freeTextProducts = normalizedProducts.filter((product) => product.isFreeText);
  const categoryOrder = (normalizedStyle.customCategoryOrder || []).filter((category) => !category.startsWith('ft_'));

  const { existingCategories, categoryRows, normalizedProducts: productsWithCategoryIds } = await resolveCategoriesForSave(
    workspaceId,
    catalogProducts,
    categoryOrder,
  );

  if (historyV12Enabled() && menuId) {
    const renderSnapshot = createRenderSnapshot([...productsWithCategoryIds,...freeTextProducts], normalizedStyle, sortOption);
    const editorState = createEditorState(normalizedStyle, normalizedProducts.filter(p => p.isFreeText), sortOption);
    const result = await revisionRequest('save', {menuId, expectedWrite: expectedWrite ?? 0,
      operationId: operationId || revisionOperationId(), snapshot: renderSnapshot, editor: editorState, actionLabel, catalog: {categories:categoryRows,products:productsWithCategoryIds.map((p,index)=>({id:p.id,workspace_id:workspaceId,category_id:p.categoryId,name:p.name,description:p.description,base_price:roundPrice(p.price),primary_asset_id:p.imageAssetId||null,sort_index:index,is_active:true}))}});
    document.dispatchEvent(new CustomEvent('automenu:history-warning', {detail:{menuId:result.menu.id,warning:result.historyWarning}}));
    await propagateSyncedProducts({workspaceId,sourceMenuId:menuId,sourceMenuName:result.menu.name,userId,sourceProducts:[...productsWithCategoryIds,...freeTextProducts]});
    return {menu:mapMenuRow(result.menu),currentVersion:mapMenuVersionRow(result.version),
      products:[...productsWithCategoryIds,...freeTextProducts],style:normalizedStyle,templates:normalizedTemplates,sortOption};
  }

  if (categoryRows.length > 0) {
    const { error: upsertCategoryError } = await supabase
      .from('catalog_categories')
      .upsert(categoryRows, { onConflict: 'id' });

    if (upsertCategoryError) {
      throw upsertCategoryError;
    }
  }

  const catalogRows = productsWithCategoryIds.map((product, index) => ({
    id: product.id,
    workspace_id: workspaceId,
    category_id: product.categoryId,
    name: product.name,
    description: product.description,
    base_price: roundPrice(product.price),
    primary_asset_id: product.imageAssetId || null,
    sort_index: index,
    is_active: true,
  }));

  if (catalogRows.length > 0) {
    const { error: upsertProductError } = await supabase
      .from('catalog_products')
      .upsert(catalogRows, { onConflict: 'id' });

    if (upsertProductError) {
      throw upsertProductError;
    }
  }

  const { data: existingProductRows, error: existingProductError } = await supabase
    .from('catalog_products')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (existingProductError) {
    throw existingProductError;
  }

  const liveProductIds = new Set(productsWithCategoryIds.map((product) => product.id));
  const productsToDelete = (existingProductRows || []).map((row) => row.id).filter((id) => !liveProductIds.has(id));
  if (productsToDelete.length > 0) {
    const { error: deleteProductError } = await supabase.from('catalog_products').delete().in('id', productsToDelete);
    if (deleteProductError) {
      throw deleteProductError;
    }
  }

  const liveCategoryIds = new Set(categoryRows.map((row) => row.id));
  const categoriesToDelete = existingCategories.map((category) => category.id).filter((id) => !liveCategoryIds.has(id));
  if (categoriesToDelete.length > 0) {
    const { error: deleteCategoryError } = await supabase.from('catalog_categories').delete().in('id', categoriesToDelete);
    if (deleteCategoryError) {
      throw deleteCategoryError;
    }
  }

  const activeMenu = await resolveActiveMenu(workspaceId, menuId);
  const editorState = createEditorState(normalizedStyle, freeTextProducts, sortOption);
  const renderSnapshot = createRenderSnapshot([...productsWithCategoryIds, ...freeTextProducts], normalizedStyle, sortOption);
  let resolvedActionLabel = actionLabel;
  if (actionLabel === 'Alteração salva' && activeMenu.currentDraftVersionId) {
    const { data: previousVersion } = await supabase
      .from('menu_versions')
      .select('render_snapshot')
      .eq('id', activeMenu.currentDraftVersionId)
      .maybeSingle();
    resolvedActionLabel = describeRevisionChange(previousVersion?.render_snapshot || null, renderSnapshot);
  }
  const { versionId: currentVersionId, versionNumber: nextVersionNumber } = await insertMenuVersionWithRetry({
    menuId: activeMenu.id,
    userId,
    editorState,
    renderSnapshot,
    actionLabel: resolvedActionLabel,
  });

  const { data: menuRow, error: updateMenuError } = await supabase
    .from('menus')
    .update({
      name: activeMenu.name,
      status: 'draft',
      current_draft_version_id: currentVersionId,
    })
    .eq('id', activeMenu.id)
    .select('*')
    .single();

  if (updateMenuError) {
    throw updateMenuError;
  }

  await propagateSyncedProducts({
    workspaceId,
    sourceMenuId: activeMenu.id,
    sourceMenuName: activeMenu.name,
    userId,
    sourceProducts: [...productsWithCategoryIds, ...freeTextProducts],
  });

  const savedMenu = mapMenuRow(menuRow);
  const savedVersion: MenuVersion = {
    id: currentVersionId,
    menuId: savedMenu.id,
    versionNumber: nextVersionNumber,
    versionType: 'snapshot',
    editorState,
    renderSnapshot,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    actionLabel: resolvedActionLabel,
  };

  return {
    menu: savedMenu,
    currentVersion: savedVersion,
    products: [...productsWithCategoryIds, ...freeTextProducts],
    style: normalizedStyle,
    templates: mergeTemplates(
      normalizedTemplates.filter((template) => template.scope === 'workspace'),
      normalizedTemplates.filter((template) => template.scope === 'system'),
    ),
    sortOption,
  };
};
