import type { MenuStyle, Product } from '../types';

export const applyFontToMenuStyle = (style: MenuStyle, fontFamily: string): MenuStyle => ({
  ...style,
  fontFamily,
  elementStyles: Object.fromEntries(
    Object.entries(style.elementStyles).map(([key, value]) => [key, { ...(value || {}), fontFamily }]),
  ) as MenuStyle['elementStyles'],
  name: 'Custom',
});

export const applyFontToFreeTexts = (products: Product[], fontFamily: string): Product[] => (
  products.map((product) => (
    product.isFreeText
      ? { ...product, styles: { ...(product.styles || {}), fontFamily } }
      : product
  ))
);

export const getConfiguredCanvasFonts = (style: MenuStyle, products: Product[]) => {
  const fonts = new Set<string>([style.fontFamily]);
  Object.values(style.elementStyles).forEach((elementStyle) => {
    if (elementStyle?.fontFamily) fonts.add(elementStyle.fontFamily);
  });
  products.forEach((product) => {
    if (product.isFreeText && product.styles?.fontFamily) fonts.add(product.styles.fontFamily);
  });
  return Array.from(fonts).filter(Boolean);
};
