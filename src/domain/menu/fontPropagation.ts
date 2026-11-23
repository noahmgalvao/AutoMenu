import type { MenuStyle, Product } from './model';
import type { FormattingKind } from './itemFormatting';

function withoutLocalFonts(overrides: MenuStyle['itemFormattingOverrides']) {
  if (!overrides) return undefined;
  const next = { ...overrides };
  for (const kind of ['category', 'product'] as const satisfies readonly FormattingKind[]) {
    if (!overrides[kind]) continue;
    next[kind] = Object.fromEntries(Object.entries(overrides[kind]).map(([id, patch]) => [
      id, patch.elementStyles ? {
        ...patch,
        elementStyles: Object.fromEntries(Object.entries(patch.elementStyles).map(([field, element]) => [
          field, element ? Object.fromEntries(Object.entries(element).filter(([key]) => key !== 'fontFamily')) : element,
        ])),
      } : patch,
    ]));
  }
  return next;
}

export const applyFontToMenuStyle = (style: MenuStyle, fontFamily: string): MenuStyle => ({
  ...style,
  fontFamily,
  itemFormattingOverrides: withoutLocalFonts(style.itemFormattingOverrides),
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
  for (const entries of Object.values(style.itemFormattingOverrides || {})) {
    for (const patch of Object.values(entries || {})) {
      for (const element of Object.values(patch.elementStyles || {})) {
        if (element?.fontFamily) fonts.add(element.fontFamily);
      }
    }
  }
  products.forEach((product) => {
    if (product.isFreeText && product.styles?.fontFamily) fonts.add(product.styles.fontFamily);
  });
  style.addedImages?.forEach(({ shape }) => {
    if (shape?.text && shape.textStyle?.fontFamily) fonts.add(shape.textStyle.fontFamily);
  });
  return Array.from(fonts).filter(Boolean);
};
