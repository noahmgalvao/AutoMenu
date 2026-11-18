import type { MenuStyle } from '../../../domain/menu/model';

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

export const PRODUCT_CARD_SHAPES = [
  ['template', 'Do modelo'], ['square', 'Reto'], ['rounded', 'Arredondado'], ['soft', 'Cantos amplos'], ['arch', 'Arco'],
] as const;

export const PRODUCT_IMAGE_FRAMES = [
  ['template', 'Do modelo'], ['rounded', 'Arredondada'], ['circle', 'Circular'], ['arch', 'Arco'],
] as const;

export function getProductCardRadius(style: MenuStyle, shape = style.productCardShape) {
  if (shape === 'square') return 0;
  if (shape === 'rounded') return 12;
  if (shape === 'soft') return 24;
  if (shape === 'arch') return 36;
  return style.globalRadius ?? 12;
}

export function getProductCardCornerRadii(style: MenuStyle, radius: number) {
  return style.productCardShape === 'arch'
    ? `${radius}px ${radius}px ${Math.round(radius / 4)}px ${Math.round(radius / 4)}px`
    : `${radius}px`;
}

export function getProductPhotoFrameRadius(frame: MenuStyle['productImageFrame'], radius?: number) {
  if (frame === 'circle') return '50%';
  if (frame === 'arch') return `50% 50% ${radius ?? 8}px ${radius ?? 8}px / 34% 34% ${radius ?? 8}px ${radius ?? 8}px`;
  return `${radius ?? (frame === 'rounded' ? 12 : 6)}px`;
}
