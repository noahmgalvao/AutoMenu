import type { MenuStyle, TemplateDesign } from '../types';

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

export function getTemplateDesignAttributes(style: MenuStyle) {
  const design = style.design;
  if (!design) return {};
  return Object.fromEntries(Object.entries(design).map(([key, value]) =>
    ['data-design-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), String(value)]));
}

export function getTemplateColors(style: MenuStyle) {
  const accent = style.primaryColor;
  const tint = /^#[a-f\d]{6}$/i.test(accent) ? accent + '18' : 'rgba(100, 116, 139, .12)';
  const [width, height] = (style.design?.imageRatio || '4:3').split(':').map(Number);
  return {
    '--template-accent': `var(--automenu-preview-primary, ${accent})`,
    '--template-ink': `var(--automenu-preview-text, ${style.textColor})`,
    '--template-paper': `var(--automenu-preview-background, ${style.backgroundColor})`,
    '--template-tint': `var(--automenu-preview-tint, ${tint})`,
    '--template-radius': (style.globalRadius ?? 8) + 'px',
    '--template-image-ratio': width + ' / ' + height,
  };
}

export function templateProductImageHeight(style: MenuStyle, standardHeight: number) {
  if (!style.design) return standardHeight;
  const [width, height] = style.design.imageRatio.split(':').map(Number);
  const ratioFactor = 4 * height / (3 * width);
  return Math.round(standardHeight * Math.min(1.5, Math.max(0.7, ratioFactor)));
}

export const templateHeaderExtra = (style: MenuStyle) =>
  style.design?.header === 'hero' ? 40 : style.design?.header === 'banner' ? 26 : style.design?.header === 'split' ? 10 : 0;

export const templateCategoryExtra = (style: MenuStyle) =>
  !style.design || style.design.category === 'plain' ? 0 : 14;
