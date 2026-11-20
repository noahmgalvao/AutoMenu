import type { CSSProperties } from 'react';
import type { MenuStyle } from '../../../domain/menu/model';

export type PhotoType = 'category' | 'product';

export const livePhotoScaleVariable = (type: PhotoType) =>
  type === 'category' ? '--automenu-live-category-photo-scale' : '--automenu-live-product-photo-scale';

export function photoDimensions(type: PhotoType, scale: number, limit: number, maxWidth: string,
  frame?: MenuStyle['productImageFrame'], ratio = 1): CSSProperties {
  const aspect = frame === 'circle' ? '1' : `clamp(.375, var(--automenu-photo-aspect, ${ratio}), 3)`;
  const size = `calc(${limit}px * min(1, ${aspect}))`;
  const amount = `var(${livePhotoScaleVariable(type)}, ${scale})`;
  if (frame !== 'circle') return { width: `min(${maxWidth}, calc(${size} * ${amount}))`, aspectRatio: aspect };

  const base = `min(${size}, calc(${maxWidth} * .72))`;
  const max = `min(${maxWidth}, calc(${size} * 2.5))`;
  return {
    width: `calc(${base} * min(1, ${amount}) + (${max} - ${base}) * (max(0, ${amount} - 1) / 1.5))`,
    aspectRatio: aspect,
  };
}
