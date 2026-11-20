import type { CSSProperties } from 'react';
import type { TextOutline } from '../../../domain/menu/model';
import { resolveTextOutline } from '../../../domain/menu/textOutline';

export function getTextOutlineStyle(outline?: TextOutline, scale = 1): CSSProperties | undefined {
  const stroke = resolveTextOutline(outline);
  return stroke && {
    WebkitTextStrokeColor: stroke.color,
    WebkitTextStrokeWidth: `min(${stroke.width * scale}px, 0.2em)`,
    paintOrder: 'stroke fill',
  };
}
