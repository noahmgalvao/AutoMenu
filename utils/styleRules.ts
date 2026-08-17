import {
  DEFAULT_FONT_SIZE_LIMITS,
  DEFAULT_MINIMUM_FONT_SIZE,
  DEFAULT_MENU_CONTENT_SPACING,
  DEFAULT_MENU_MARGINS,
} from '../constants';
import type {
  FontSizeLimitKey,
  FontSizeLimits,
  MenuContentSpacing,
  MenuMargins,
  MenuStyle,
} from '../types';

const positiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const resolveFontSizeLimits = (style: MenuStyle): FontSizeLimits => ({
  ...DEFAULT_FONT_SIZE_LIMITS,
  ...(style.fontSizeLimits || {}),
});

export const resolveMinimumFontSize = (style: MenuStyle): number => {
  const parsed = Number(style.minimumFontSize);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(300, parsed)
    : DEFAULT_MINIMUM_FONT_SIZE;
};

export const resolveMenuMargins = (style: MenuStyle): MenuMargins => {
  const legacyPadding = positiveNumber(style.pagePadding, DEFAULT_MENU_MARGINS.top);
  return {
    top: positiveNumber(style.margins?.top, legacyPadding),
    bottom: positiveNumber(style.margins?.bottom, legacyPadding),
    left: positiveNumber(style.margins?.left, legacyPadding),
    right: positiveNumber(style.margins?.right, legacyPadding),
    columnGap: positiveNumber(style.margins?.columnGap, DEFAULT_MENU_MARGINS.columnGap),
  };
};

export const resolveMenuContentSpacing = (style: MenuStyle): MenuContentSpacing => ({
  headerToContent: positiveNumber(
    style.contentSpacing?.headerToContent,
    style.elementStyles?.menuSubtitle?.marginBottom ?? DEFAULT_MENU_CONTENT_SPACING.headerToContent,
  ),
  categoryToProduct: positiveNumber(
    style.contentSpacing?.categoryToProduct,
    style.elementStyles?.category?.marginBottom ?? DEFAULT_MENU_CONTENT_SPACING.categoryToProduct,
  ),
  productNameToDescription: positiveNumber(
    style.contentSpacing?.productNameToDescription,
    DEFAULT_MENU_CONTENT_SPACING.productNameToDescription,
  ),
  betweenProducts: positiveNumber(
    style.contentSpacing?.betweenProducts,
    style.itemGap ?? DEFAULT_MENU_CONTENT_SPACING.betweenProducts,
  ),
  productNameToPrice: positiveNumber(
    style.contentSpacing?.productNameToPrice,
    DEFAULT_MENU_CONTENT_SPACING.productNameToPrice,
  ),
});

export const clampFontSize = (
  style: MenuStyle,
  key: FontSizeLimitKey,
  value: unknown,
  fallback: number,
) => {
  const parsed = positiveNumber(value, fallback);
  return Math.max(
    resolveMinimumFontSize(style),
    Math.min(resolveFontSizeLimits(style)[key], parsed),
  );
};
