import { type ImportPageDimensions, isBoundingBox } from './importGeometry';
import type { Product, MenuStyle } from '../../domain/menu/model';
import { FREE_TEXT_PREFIX } from '../../domain/menu/flow';
import { roundFontSize } from '../../domain/menu/styleRules';
import { isUnmodifiedInitialProduct } from '../../domain/menu/pristineItems';
import { normalizeEntityName } from '../../domain/imports/entityNames';
import { roundPrice } from '../../domain/menu/price';

export const buildFreeTextProduct = (
  freeText: any,
  pageIndex: number,
  pageDimensions: ImportPageDimensions,
): Product => {
  const id = crypto.randomUUID();
  return {
    id,
    name: String(freeText.text || ''),
    price: 0,
    description: '',
    category: `${FREE_TEXT_PREFIX}imported_page_${pageIndex}_${id}`,
    categoryId: null,
    image: '',
    isFreeText: true,
    customMarginTop: 10 * pageDimensions.verticalScale,
    boundingBox: isBoundingBox(freeText.boundingBox) ? freeText.boundingBox : undefined,
    styles: {
      fontSize: roundFontSize(
        Number(freeText.fontSize) * pageDimensions.uniformScale,
        18 * pageDimensions.uniformScale,
      ),
      color: freeText.color,
      textAlign: freeText.alignment || 'left',
      fontFamily: freeText.fontFamily,
      fontWeight: freeText.fontWeight,
      textTransform: freeText.textTransform,
    },
  };
};

export const getImportedFreeTextPageIndex = (category: string) => {
  const match = /^(?:ft_imported_page_|ft_zone_imported_page_)(\d+)(?:_|$)/.exec(category);
  return match ? Number(match[1]) : 0;
};

interface MergedImportedProducts {
  products: Product[];
  customCategoryOrder: string[];
  customProductOrder: Record<string, string[]>;
  hiddenProductIds: string[];
  categoryNameByKey: Map<string, string>;
  importedProductIds: string[];
}

const appendUnique = <T,>(values: T[], value: T) => {
  if (!values.includes(value)) values.push(value);
};

export const mergeImportedProducts = (
  currentProducts: Product[],
  importedProducts: Product[],
  currentStyle: MenuStyle,
): MergedImportedProducts => {
  const removesUntouchedInitialProducts = importedProducts.length > 0;
  const existingProducts = currentProducts.filter((product) => (
    !product.isFreeText
    && !(removesUntouchedInitialProducts && isUnmodifiedInitialProduct(product))
  ));
  const existingCategoryNameByKey = new Map<string, string>();
  const existingCategoryIdByKey = new Map<string, string>();

  existingProducts.forEach((product) => {
    const categoryKey = normalizeEntityName(product.category);
    if (!categoryKey) return;
    if (!existingCategoryNameByKey.has(categoryKey)) {
      existingCategoryNameByKey.set(categoryKey, product.category);
    }
    if (product.categoryId && !existingCategoryIdByKey.has(categoryKey)) {
      existingCategoryIdByKey.set(categoryKey, product.categoryId);
    }
  });

  const existingCategoryOrder: string[] = [];
  (currentStyle.customCategoryOrder || []).forEach((category) => {
    const canonicalName = existingCategoryNameByKey.get(normalizeEntityName(category));
    if (canonicalName) appendUnique(existingCategoryOrder, canonicalName);
  });
  existingProducts.forEach((product) => {
    appendUnique(existingCategoryOrder, product.category);
  });

  const existingProductOrderByCategory = new Map<string, Product[]>();
  existingCategoryOrder.forEach((category) => {
    const categoryKey = normalizeEntityName(category);
    const categoryProducts = existingProducts.filter((product) => (
      normalizeEntityName(product.category) === categoryKey
    ));
    const productsById = new Map(categoryProducts.map((product) => [product.id, product]));
    const ordered: Product[] = [];

    (currentStyle.customProductOrder?.[category] || []).forEach((productId) => {
      const product = productsById.get(productId);
      if (product && !ordered.includes(product)) ordered.push(product);
    });
    categoryProducts.forEach((product) => {
      if (!ordered.includes(product)) ordered.push(product);
    });
    existingProductOrderByCategory.set(categoryKey, ordered);
  });

  const categoryNameByKey = new Map(existingCategoryNameByKey);
  const categoryIdByKey = new Map(existingCategoryIdByKey);
  const resolvedProductByKey = new Map<string, Product>();
  existingProducts.forEach((product) => {
    const lookupKey = `${normalizeEntityName(product.category)}\u0000${normalizeEntityName(product.name)}`;
    if (!resolvedProductByKey.has(lookupKey)) {
      resolvedProductByKey.set(lookupKey, product);
    }
  });

  const resolvedProductById = new Map(existingProducts.map((product) => [product.id, product]));
  const importedCategoryOrder: string[] = [];
  const importedProductIdsByCategory = new Map<string, string[]>();

  importedProducts.forEach((importedProduct) => {
    const categoryKey = normalizeEntityName(importedProduct.category);
    const productKey = normalizeEntityName(importedProduct.name);
    if (!categoryKey || !productKey) return;

    let categoryName = categoryNameByKey.get(categoryKey);
    if (!categoryName) {
      categoryName = importedProduct.category;
      categoryNameByKey.set(categoryKey, categoryName);
    }
    if (!categoryIdByKey.has(categoryKey)) {
      categoryIdByKey.set(categoryKey, importedProduct.categoryId || crypto.randomUUID());
    }
    appendUnique(importedCategoryOrder, categoryName);

    const lookupKey = `${categoryKey}\u0000${productKey}`;
    const existingProduct = resolvedProductByKey.get(lookupKey);
    let resolvedProduct: Product;

    if (existingProduct) {
      const hasSameImportedData = (
        existingProduct.description === importedProduct.description
        && Number(existingProduct.price) === Number(importedProduct.price)
      );
      resolvedProduct = hasSameImportedData
        ? existingProduct
        : {
          ...existingProduct,
          description: importedProduct.description,
          price: roundPrice(importedProduct.price),
        };
    } else {
      resolvedProduct = {
        ...importedProduct,
        category: categoryName,
        categoryId: categoryIdByKey.get(categoryKey) || importedProduct.categoryId,
      };
    }

    resolvedProductByKey.set(lookupKey, resolvedProduct);
    resolvedProductById.set(resolvedProduct.id, resolvedProduct);
    const importedIds = importedProductIdsByCategory.get(categoryKey) || [];
    appendUnique(importedIds, resolvedProduct.id);
    importedProductIdsByCategory.set(categoryKey, importedIds);
  });

  const customCategoryOrder = [...importedCategoryOrder];
  existingCategoryOrder.forEach((category) => appendUnique(customCategoryOrder, category));

  const customProductOrder: Record<string, string[]> = {};
  customCategoryOrder.forEach((category) => {
    const categoryKey = normalizeEntityName(category);
    const orderedIds = [...(importedProductIdsByCategory.get(categoryKey) || [])];
    (existingProductOrderByCategory.get(categoryKey) || []).forEach((product) => {
      appendUnique(orderedIds, product.id);
    });
    customProductOrder[category] = orderedIds;
  });

  const products: Product[] = [];
  customCategoryOrder.forEach((category) => {
    (customProductOrder[category] || []).forEach((productId) => {
      const product = resolvedProductById.get(productId);
      if (product && !products.some((candidate) => candidate.id === product.id)) {
        products.push(product);
      }
    });
  });

  const retainedProductIds = new Set(products.map((product) => product.id));
  return {
    products,
    customCategoryOrder,
    customProductOrder,
    hiddenProductIds: (currentStyle.hiddenProductIds || [])
      .filter((productId) => retainedProductIds.has(productId)),
    categoryNameByKey,
    importedProductIds: Array.from(importedProductIdsByCategory.values()).flat(),
  };
};
