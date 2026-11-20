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

export const isUnmodifiedInitialProduct = (product?: Product | null) => {
  if (!product || product.isFreeText) return false;

  const initialProduct = INITIAL_PRODUCTS.find((candidate) => candidate.id === product.id);
  if (!initialProduct) return false;

  return (
    product.name === initialProduct.name
    && product.description === initialProduct.description
    && Number(product.price) === Number(initialProduct.price)
    && product.category === initialProduct.category
    && (product.image || '') === (initialProduct.image || '')
    && !product.customMarginTop
    && !product.styles
    && !product.boundingBox
    && (!product.extractedImages || product.extractedImages.length === 0)
  );
};
