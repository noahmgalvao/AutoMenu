import { normalizeTemplateDesign } from '../../domain/templates/templateDesign';
import type { MenuPageSetup } from '../../domain/menu/pageModel';
import type { MenuStyle } from '../../domain/menu/model';
import { resolveMenuPageDimensions, normalizeMenuPageSetup } from '../../domain/menu/pageSetup';
import { LEGACY_TEMPLATE_IDS } from '../../domain/templates/templateCatalog';
import { resolveMenuMargins } from '../../domain/menu/styleRules';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(min, max), Math.max(min, Number.isFinite(value) ? value : min));

export function resizeMenuStyle(current: MenuStyle, setup: MenuPageSetup): MenuStyle {
  const next = { ...current, pageSetup: normalizeMenuPageSetup(setup) };
  const from = resolveMenuPageDimensions(current);
  const to = resolveMenuPageDimensions(next);
  if (from.widthPx === to.widthPx && from.heightPx === to.heightPx) return next;

  const margins = resolveMenuMargins(next);
  const xRatio = to.widthPx / from.widthPx;
  const yRatio = to.heightPx / from.heightPx;
  const left = Math.min(margins.left, to.widthPx / 3);
  const top = Math.min(margins.top, to.heightPx / 3);
  const right = Math.max(left + 1, to.widthPx - Math.min(margins.right, to.widthPx / 3));
  const bottom = Math.max(top + 1, to.heightPx - Math.min(margins.bottom, to.heightPx / 3));
  const x = (value: number, width = 1) => clamp(value * xRatio, left, right - width);
  const y = (value: number) => clamp(value * yRatio, top, bottom - 28);

  return {
    ...next,
    margins: { ...margins, left, right: to.widthPx - right, top, bottom: to.heightPx - bottom,
      columnGap: Math.min(margins.columnGap, (right - left) / 8) },
    floatingText: current.floatingText?.map((item) => ({ ...item, x: x(item.x), y: y(item.y) })),
    addedImages: current.addedImages?.map((image) => {
      const width = Math.min(image.width * Math.min(xRatio, yRatio), right - left);
      return { ...image, x: x(image.x, width), y: y(image.y), width };
    }),
    freeTextBackgrounds: current.freeTextBackgrounds && Object.fromEntries(Object.entries(current.freeTextBackgrounds)
      .map(([id, position]) => {
        const width = Math.min(position.width, to.widthPx);
        return [id, {
          ...position, x: clamp(position.x * xRatio, 0, to.widthPx - width),
          y: clamp(position.y * yRatio, 0, to.heightPx - 28), width,
        }];
      })),
    categoryPositions: current.categoryPositions && Object.fromEntries(Object.entries(current.categoryPositions)
      .filter(([, position]) => position.pageX !== undefined)
      .map(([category, position]) => [category, {
        ...position, pageX: clamp(position.pageX! * xRatio, 0, to.widthPx - 24),
        y: clamp(position.y * yRatio, 0, to.heightPx - 28),
      }])),
    categoryPlacements: undefined,
  };
}

export const getAppliedTemplateId = (style: MenuStyle) =>
  style.appliedTemplateId ?? LEGACY_TEMPLATE_IDS.get(style.id) ?? style.id;

export function applyTemplateToCurrentStyle(current: MenuStyle, template: MenuStyle): MenuStyle {
  const resized = resizeMenuStyle({ ...current, margins: template.margins, pagePadding: template.pagePadding }, normalizeMenuPageSetup(template.pageSetup));
  const sameColumns = (current.categoryColumnCount || 1) === (template.categoryColumnCount || 1);
  const sameProductColumns = current.columnCount === template.columnCount;
  const sameLayout = current.layoutMode === template.layoutMode;
  const visual = structuredClone(template);
  return {
    ...resized,
    appliedTemplateId: template.id,
    appliedTemplateVersionId: template.templateVersionId,
    name: template.name,
    fontFamily: visual.fontFamily,
    primaryColor: visual.primaryColor,
    backgroundColor: current.menuBackgroundPhoto ? current.backgroundColor : visual.backgroundColor,
    textColor: visual.textColor,
    backgroundImage: visual.backgroundImage,
    miniFoodTextureColor: visual.miniFoodTextureColor,
    backgroundAssetId: visual.backgroundAssetId,
    templateBackgroundFit: visual.sourceType === 'ai_import' ? 'fill' : 'cover',
    layoutMode: visual.layoutMode,
    showImages: visual.showImages,
    showCategoryImages: visual.showCategoryImages,
    categoryImageScale: visual.categoryImageScale ?? visual.imageScale,
    columnCount: visual.columnCount,
    categoryColumnCount: visual.categoryColumnCount,
    categoryColumnWidths: visual.categoryColumnWidths?.length === (visual.categoryColumnCount || 1)
      ? visual.categoryColumnWidths : undefined,
    categoryPlacements: sameColumns && sameProductColumns && sameLayout ? resized.categoryPlacements : undefined,
    categoryPositions: sameColumns && sameProductColumns && sameLayout ? resized.categoryPositions
      : resized.categoryPositions && Object.fromEntries(Object.entries(resized.categoryPositions)
        .filter(([, position]) => position.pageX !== undefined)
        .map(([category, position]) => [category, {
          ...position, columnIndex: Math.min(position.columnIndex, (visual.categoryColumnCount || 1) - 1),
        }])),
    pagePadding: visual.pagePadding,
    margins: resized.margins,
    itemGap: visual.itemGap,
    contentSpacing: visual.contentSpacing,
    globalRadius: visual.globalRadius,
    cardBackgroundColor: visual.cardBackgroundColor,
    cardBackgroundColorOverride: visual.cardBackgroundColorOverride,
    borders: visual.borders,
    markers: visual.markers,
    imageScale: visual.imageScale,
    fontSizeLimits: visual.fontSizeLimits,
    elementStyles: visual.elementStyles,
    elementColorOverrides: visual.elementColorOverrides,
    design: normalizeTemplateDesign(visual.design),
    pageSetup: resized.pageSetup,
  };
}
