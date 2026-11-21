import type React from 'react';
import type { CategoryDividerStyle, MenuStyle } from '../../../domain/menu/model';

export const CATEGORY_DIVIDER_PRESETS: { value: CategoryDividerStyle; label: string }[] = [
  { value: 'solid', label: 'Fina' },
  { value: 'strong', label: 'Forte' },
  { value: 'double', label: 'Dupla' },
  { value: 'dashed', label: 'Tracejada' },
  { value: 'dotted', label: 'Pontilhada' },
  { value: 'fade', label: 'Degradê' },
  { value: 'tapered', label: 'Afunilada' },
  { value: 'beaded', label: 'Contas' },
  { value: 'ornamental', label: 'Ornamental' },
  { value: 'accent', label: 'Destaque' },
  { value: 'none', label: 'Sem linha' },
];

export const resolveCategoryDivider = (style: MenuStyle, category: string): CategoryDividerStyle =>
  style.categoryDividerStyles?.[category] || style.categoryDividerStyle || style.design?.divider || 'solid';

export const resolveProductDivider = (style: MenuStyle, id: string): CategoryDividerStyle =>
  style.productDividerStyles?.[id] ?? style.productDividerStyle ?? 'none';

export const getCategoryDividerStyle = (
  preset: CategoryDividerStyle = 'solid',
  color: string,
  titleEdge: 'left' | 'right' = 'right',
): React.CSSProperties => {
  const base: React.CSSProperties = { height: 1, minWidth: 0, flexGrow: 1 };
  const towardTitle = titleEdge === 'right' ? '90deg' : '270deg';
  switch (preset) {
    case 'none':
      return { ...base, visibility: 'hidden' };
    case 'strong':
      return { ...base, height: 2, borderRadius: 999, backgroundColor: color, opacity: 0.68 };
    case 'double':
      return { ...base, height: 4, borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}`, opacity: 0.55 };
    case 'dashed':
      return { ...base, borderTop: `1px dashed ${color}`, opacity: 0.65 };
    case 'dotted':
      return { ...base, borderTop: `2px dotted ${color}`, opacity: 0.62 };
    case 'fade':
      return { ...base, background: `linear-gradient(${towardTitle}, transparent, ${color})`, opacity: 0.72 };
    case 'tapered':
      return { ...base, height: 3, background: `linear-gradient(${towardTitle}, transparent 0%, ${color} 100%)`, clipPath: titleEdge === 'right' ? 'polygon(0 42%, 100% 0, 100% 100%, 0 58%)' : 'polygon(0 0, 100% 42%, 100% 58%, 0 100%)', opacity: 0.68 };
    case 'beaded':
      return { ...base, height: 3, backgroundImage: `radial-gradient(circle, ${color} 1.2px, transparent 1.35px)`, backgroundPosition: 'right center', backgroundSize: '7px 3px', opacity: 0.68 };
    case 'ornamental':
      return { ...base, position: 'relative', height: 4, borderBlock: `1px solid ${color}`, color };
    case 'accent':
      return { ...base, height: 3, background: `linear-gradient(${towardTitle}, transparent 0%, ${color} 64%, ${color} 82%, transparent 82%)`, opacity: 0.72 };
    case 'solid':
    default:
      return { ...base, backgroundColor: color, opacity: 0.4 };
  }
};
