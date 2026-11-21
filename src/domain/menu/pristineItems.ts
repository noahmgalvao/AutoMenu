import type { Product } from './model';
import { INITIAL_PRODUCTS } from './defaults';

const normalize = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const isDefaultFreeText = (text?: string) => normalize(text) === 'novo texto';
export const isDefaultProductName = (name?: string) => ['new item', 'novo item'].includes(normalize(name));
export const isDefaultProductDescription = (description?: string) => ['description', 'descricao'].includes(normalize(description));
export const isDefaultCategoryName = (name: string) => /^(new category|nova categoria)(?:\s+\d+)?$/i.test(name.trim());

export const isPristineNewProduct = (product?: Product | null) => {
  if (!product || product.isFreeText) return false;

  const hasDefaultDescription = isDefaultProductDescription(product.description) || normalize(product.description) === '';

  return (
    isDefaultProductName(product.name) &&
    Number(product.price) === 0 &&
    hasDefaultDescription &&
    !product.image &&
    !product.imageAssetId
  );
};

export const isPristineNewCategory = (categoryName: string, products: Product[]) => {
  if (!isDefaultCategoryName(categoryName)) return false;

  const categoryProducts = products.filter((product) => !product.isFreeText && product.category === categoryName);
  return categoryProducts.length > 0 && categoryProducts.every(isPristineNewProduct);
};

const legacyPlaceholderPrices = [12.99, 6.5, 10, 8.99, 14.5];

export const isUnmodifiedInitialProduct = (product?: Product | null) => {
  if (!product || product.isFreeText) return false;

  const index = INITIAL_PRODUCTS.findIndex((candidate) => candidate.id === product.id);
  const initialProduct = INITIAL_PRODUCTS[index];
  if (!initialProduct) return false;

  const matchesCurrent = Number(product.price) === initialProduct.price && !product.image;
  const matchesLegacy = Number(product.price) === legacyPlaceholderPrices[index]
    && product.image === `https://picsum.photos/200/200?random=${product.id}`;
  return (
    product.name === initialProduct.name
    && product.description === initialProduct.description
    && product.category === initialProduct.category
    && (matchesCurrent || matchesLegacy)
    && !product.customMarginTop
    && !product.styles
    && !product.boundingBox
    && (!product.extractedImages || product.extractedImages.length === 0)
  );
};
