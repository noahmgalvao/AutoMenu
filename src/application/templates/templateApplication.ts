import { INITIAL_STYLE, NO_TEMPLATE_ID } from '../../domain/menu/defaults';
import { projectTemplateStyle } from './portableTemplateStyle';
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
      .map(([category, position]) => [category, {
        ...position, pageX: position.pageX === undefined ? undefined : clamp(position.pageX * xRatio, 0, to.widthPx - 24),
        y: clamp(position.y * yRatio, 0, to.heightPx - 28),
      }])),
    categoryPlacements: current.categoryPlacements,
  };
}

export const getAppliedTemplateId = (style: MenuStyle) => {
  if (style.appliedTemplateId === null || style.id === NO_TEMPLATE_ID && !style.appliedTemplateId) return NO_TEMPLATE_ID;
  const id = style.appliedTemplateId;
  return id ? LEGACY_TEMPLATE_IDS.get(id) ?? id : LEGACY_TEMPLATE_IDS.get(style.id);
};

export function applyTemplateToCurrentStyle(current: MenuStyle, template: MenuStyle): MenuStyle {
  const visual = projectTemplateStyle(template);
  const resized = resizeMenuStyle({ ...current, margins: visual.margins, pagePadding: visual.pagePadding }, normalizeMenuPageSetup(visual.pageSetup));
  const sameColumns = (current.categoryColumnCount || 1) === (visual.categoryColumnCount || 1)
    && current.columnCount === visual.columnCount && current.layoutMode === visual.layoutMode;
  const neutral = template.id === NO_TEMPLATE_ID;
  const columns = visual.categoryColumnCount || 1;
  const remap = <T extends { columnIndex: number }>(positions?: Record<string, T>) => positions
    && Object.fromEntries(Object.entries(positions).map(([key, position]) => [key, {
      ...position, columnIndex: Math.min(position.columnIndex, columns - 1),
    }]));
  const authorBackground = current.backgroundAssetId && (current.templateBackgroundOrigin === 'author'
    || !current.templateBackgroundOrigin && !current.appliedTemplateId);

  return {
    ...resized, ...visual,
    appliedTemplateId: neutral ? null : template.id,
    appliedTemplateVersionId: neutral ? null : template.templateVersionId,
    name: template.name,
    backgroundColor: current.menuBackgroundPhoto ? current.backgroundColor : visual.backgroundColor,
    backgroundImage: authorBackground ? current.backgroundImage : visual.backgroundImage,
    backgroundAssetId: authorBackground ? current.backgroundAssetId : visual.backgroundAssetId,
    textContrastFills: current.textContrastFills ? {
      ...Object.fromEntries(Object.entries(current.textContrastFills).filter(([key]) => key.startsWith('freeText:'))),
      ...visual.textContrastFills,
    } : visual.textContrastFills,
    templateBackgroundOrigin: authorBackground ? 'author' : 'template',
    templateBackgroundFit: authorBackground ? current.templateBackgroundFit ?? (current.sourceType === 'ai_import' ? 'fill' : undefined)
      : visual.templateBackgroundFit ?? (template.sourceType === 'ai_import' ? 'fill' : undefined),
    splitCategoryAcrossPages: visual.splitCategoryAcrossPages ?? INITIAL_STYLE.splitCategoryAcrossPages,
    productsCanChangeCategory: visual.productsCanChangeCategory ?? INITIAL_STYLE.productsCanChangeCategory,
    minimumFontSize: visual.minimumFontSize ?? INITIAL_STYLE.minimumFontSize,
    fontSizeLimits: visual.fontSizeLimits ?? structuredClone(INITIAL_STYLE.fontSizeLimits),
    revisedFontSizeDefaults: true,
    categoryColumnWidths: visual.categoryColumnWidths?.length === columns ? visual.categoryColumnWidths : undefined,
    categoryPlacements: remap(resized.categoryPlacements),
    categoryPositions: sameColumns ? resized.categoryPositions : remap(resized.categoryPositions),
    pageSetup: resized.pageSetup, margins: resized.margins,
    portraitPageLayout: undefined,
    design: normalizeTemplateDesign(visual.design),
  };
}
