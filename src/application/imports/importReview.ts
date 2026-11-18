import type { MenuImportMode } from '../../domain/imports/model';
import type { Product, MenuStyle, CategoryImage } from '../../domain/menu/model';

export interface ProcessedMenuImport {
  importMode: MenuImportMode;
  products: Product[] | null;
  style: MenuStyle | null;
  orderStyle: Pick<
    MenuStyle,
    'customCategoryOrder' | 'customProductOrder' | 'hiddenProductIds' | 'pageBreaks' | 'categoryPlacements' | 'categoryPositions' | 'categoryColumnWidths'
  > | null;
  sourceAssetId: string;
  normalizedResult: Record<string, unknown>;
  productCount: number;
  imageCount: number;
  pageCount: number;
  previewProducts: Product[];
  previewStyle: MenuStyle;
  importedProducts: Product[];
  importedProductIds: string[];
}

export interface FinalizedMenuImport {
  products: Product[];
  style: MenuStyle;
}

export const deriveProcessedMenuImportMode = (
  processed: ProcessedMenuImport,
  mode: MenuImportMode,
  currentProducts: Product[],
  currentStyle: MenuStyle,
): ProcessedMenuImport | null => {
  if (mode === processed.importMode) return processed;
  if (processed.importMode !== 'complete') return null;

  if (mode === 'products') {
    const previewProducts = processed.previewProducts.filter((product) => !product.isFreeText);
    const previewStyle: MenuStyle = {
      ...currentStyle,
      ...(processed.orderStyle || {}),
      name: processed.orderStyle ? 'Custom' : currentStyle.name,
    };
    return {
      ...processed,
      importMode: 'products',
      products: previewProducts,
      style: null,
      previewProducts,
      previewStyle,
      normalizedResult: { ...processed.normalizedResult, importMode: 'products' },
    };
  }

  const importedStyle = processed.style;
  if (!importedStyle) return null;
  const previewStyle: MenuStyle = {
    ...importedStyle,
    categoryPlacements: currentStyle.categoryPlacements,
    categoryPositions: currentStyle.categoryPositions,
    customCategoryOrder: currentStyle.customCategoryOrder,
    customProductOrder: currentStyle.customProductOrder,
    hiddenProductIds: currentStyle.hiddenProductIds,
    pageBreaks: currentStyle.pageBreaks,
  };
  return {
    ...processed,
    importMode: 'visual',
    products: null,
    style: previewStyle,
    orderStyle: null,
    previewProducts: currentProducts,
    previewStyle,
    importedProducts: [],
    importedProductIds: [],
    normalizedResult: { ...processed.normalizedResult, importMode: 'visual' },
  };
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const getOrderedCategories = (products: Product[], style: MenuStyle) => {
  const presentCategories = unique(products.map((product) => product.category));
  return [
    ...(style.customCategoryOrder || []).filter((category) => presentCategories.includes(category)),
    ...presentCategories.filter((category) => !(style.customCategoryOrder || []).includes(category)),
  ];
};

const getOrderedProductIds = (products: Product[], style: MenuStyle, category: string) => {
  const categoryProducts = products.filter((product) => product.category === category);
  const presentIds = categoryProducts.map((product) => product.id);
  return [
    ...(style.customProductOrder?.[category] || []).filter((id) => presentIds.includes(id)),
    ...presentIds.filter((id) => !(style.customProductOrder?.[category] || []).includes(id)),
  ];
};

export const createMenuImportEditorStyle = (processed: ProcessedMenuImport): MenuStyle => {
  const importedIdSet = new Set(processed.importedProductIds);
  const categories = getOrderedCategories(processed.importedProducts, processed.previewStyle);
  return {
    ...processed.previewStyle,
    customCategoryOrder: categories,
    customProductOrder: Object.fromEntries(categories.map((category) => [
      category,
      getOrderedProductIds(processed.importedProducts, processed.previewStyle, category),
    ])),
    hiddenProductIds: (processed.previewStyle.hiddenProductIds || [])
      .filter((productId) => importedIdSet.has(productId)),
  };
};

export const finalizeMenuImport = (
  processed: ProcessedMenuImport,
  editedImportedProducts: Product[],
  editedImportStyle: MenuStyle,
): FinalizedMenuImport => {
  if (processed.importMode === 'visual') {
    return {
      products: processed.previewProducts,
      style: processed.previewStyle,
    };
  }

  const originalImportedIdSet = new Set(processed.importedProductIds);
  const retainedProducts = processed.previewProducts.filter((product) => (
    !originalImportedIdSet.has(product.id)
  ));
  const products = [...editedImportedProducts, ...retainedProducts];
  const editedCategories = getOrderedCategories(editedImportedProducts, editedImportStyle);
  const retainedCategories = getOrderedCategories(retainedProducts, processed.previewStyle)
    .filter((category) => !editedCategories.includes(category));
  const customCategoryOrder = [...editedCategories, ...retainedCategories];
  const customProductOrder = Object.fromEntries(customCategoryOrder.map((category) => {
    const editedIds = getOrderedProductIds(editedImportedProducts, editedImportStyle, category);
    const retainedIds = getOrderedProductIds(retainedProducts, processed.previewStyle, category)
      .filter((id) => !editedIds.includes(id));
    return [category, [...editedIds, ...retainedIds]];
  }));
  const editedProductIdSet = new Set(editedImportedProducts.map((product) => product.id));
  const hiddenProductIds = unique([
    ...(processed.previewStyle.hiddenProductIds || [])
      .filter((productId) => !originalImportedIdSet.has(productId)),
    ...(editedImportStyle.hiddenProductIds || [])
      .filter((productId) => editedProductIdSet.has(productId)),
  ]);
  const categoryImages: Record<string, CategoryImage> = {};
  retainedCategories.forEach((category) => {
    const image = processed.previewStyle.categoryImages?.[category];
    if (image) categoryImages[category] = image;
  });
  editedCategories.forEach((category) => {
    const image = editedImportStyle.categoryImages?.[category];
    if (image) categoryImages[category] = image;
  });

  return {
    products,
    style: {
      ...processed.previewStyle,
      customCategoryOrder,
      customProductOrder,
      hiddenProductIds,
      categoryImages,
    },
  };
};
