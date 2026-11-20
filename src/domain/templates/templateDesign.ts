import type { TemplateDesign } from './model';
import type { MenuStyle } from '../menu/model';

const variants = {
  header: ['centered', 'left', 'split', 'hero', 'banner'],
  category: ['plain', 'underline', 'filled', 'pill', 'ribbon', 'numbered'],
  product: ['classic', 'compact', 'editorial', 'card', 'featured'],
  image: ['none', 'left', 'top', 'cover', 'background'],
  imageRatio: ['1:1', '4:3', '3:4', '16:9'],
  price: ['inline', 'right', 'badge', 'pill', 'highlight'],
  card: ['flat', 'bordered', 'soft', 'elevated', 'full-bleed'],
  divider: ['none', 'solid', 'dotted', 'ornamental'],
  background: ['solid', 'texture', 'split', 'accent-blocks'],
} satisfies { [Key in Exclude<keyof TemplateDesign, 'schemaVersion'>]: TemplateDesign[Key][] };

export function normalizeTemplateDesign(value?: TemplateDesign): TemplateDesign | undefined {
  if (value?.schemaVersion !== 2) return undefined;
  return Object.entries(variants).every(([key, options]) =>
    (options as string[]).includes(value[key as keyof typeof variants])) ? value : undefined;
}

export const templateHeaderExtra = (style: MenuStyle) =>
  style.design?.header === 'hero' ? 40 : style.design?.header === 'banner' ? 26 : style.design?.header === 'split' ? 10 : 0;

export const templateCategoryExtra = (style: MenuStyle) =>
  !style.design || style.design.category === 'plain' ? 0 : 14;
