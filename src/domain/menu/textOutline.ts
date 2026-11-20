import type { TextOutline } from './model';

export const MIN_TEXT_OUTLINE = 0.5;
export const MAX_TEXT_OUTLINE = 4;
export const DEFAULT_TEXT_OUTLINE: TextOutline = { color: '#0f172a', width: 1 };

export function resolveTextOutline(outline?: TextOutline) {
  if (!outline || !Number.isFinite(outline.width) || outline.width <= 0) return undefined;
  return {
    color: /^#[0-9a-f]{6}$/i.test(outline.color) ? outline.color : DEFAULT_TEXT_OUTLINE.color,
    width: Math.max(MIN_TEXT_OUTLINE, Math.min(MAX_TEXT_OUTLINE, outline.width)),
  };
}
