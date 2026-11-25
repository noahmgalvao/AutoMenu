import type { MenuContentSpacing } from './model';

export const SAFETY_BUFFER = 20;

export const STANDARD_GAP = 15;

export const FREE_TEXT_PREFIX = 'ft_zone_';

export const CATEGORY_CHUNK_GAP_PX = 16;

// Product rows already include their trailing between-products margin.
export function getCategoryChunkGap(spacing: Required<MenuContentSpacing>, previous: string | undefined,
  next: string, startsCategory: boolean) {
  if (previous === undefined) return 0;
  return startsCategory && previous !== next && !previous.startsWith(FREE_TEXT_PREFIX)
    ? spacing.productToNextCategory - spacing.betweenProducts
    : CATEGORY_CHUNK_GAP_PX;
}
