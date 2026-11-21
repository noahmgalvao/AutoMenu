import type { CSSProperties } from 'react';
import type { MenuStyle, Product } from '../../../domain/menu/model';
import { MAX_PHOTO_SCALE } from '../../../domain/menu/styleRules';

export type PhotoType = 'category' | 'product';

export const hasPhotosForType = (type: PhotoType, style: MenuStyle, products: Product[]) =>
  type === 'category'
    ? Object.values(style.categoryImages || {}).some(image => Boolean(image.url))
    : products.some(product => !product.isFreeText && Boolean(product.image));

export const livePhotoScaleVariable = (type: PhotoType) =>
  type === 'category' ? '--automenu-live-category-photo-scale' : '--automenu-live-product-photo-scale';

export function photoDimensions(type: PhotoType, scale: number, limit: number, maxWidth: string,
  frame?: MenuStyle['productImageFrame'], ratio = 1, fixedRatio?: number): CSSProperties {
  const aspect = frame === 'circle' ? '1' : `clamp(.375, ${fixedRatio || `var(--automenu-photo-aspect, ${ratio})`}, 3)`;
  const size = `calc(${limit}px * min(1, ${aspect}))`;
  const amount = `var(${livePhotoScaleVariable(type)}, ${scale})`;
  if (frame !== 'circle') return { width: `min(${maxWidth}, calc(${size} * ${amount}))`, aspectRatio: aspect };

  const base = `min(${size}, calc(${maxWidth} * .72))`;
  const max = `min(${maxWidth}, calc(${size} * ${MAX_PHOTO_SCALE}))`;
  return {
    width: `calc(${base} * min(1, ${amount}) + (${max} - ${base}) * (max(0, ${amount} - 1) / ${MAX_PHOTO_SCALE - 1}))`,
    aspectRatio: aspect,
  };
}
