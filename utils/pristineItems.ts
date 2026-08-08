import { Product } from '../types';
import { INITIAL_PRODUCTS } from '../constants';

const normalize = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const isPristineNewProduct = (product?: Product | null) => {
  if (!product || product.isFreeText) return false;

  const normalizedDescription = normalize(product.description);
  const hasDefaultDescription = normalizedDescription === 'description' || normalizedDescription === 'descricao' || normalizedDescription === '';
  const normalizedName = normalize(product.name);

  return (
    (normalizedName === 'new item' || normalizedName === 'novo item') &&
    Number(product.price) === 0 &&
    hasDefaultDescription &&
    !product.image &&
    !product.imageAssetId
  );
};

export const isPristineNewCategory = (categoryName: string, products: Product[]) => {
  if (!/^(new category|nova categoria)(?:\s+\d+)?$/i.test(categoryName.trim())) return false;

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
