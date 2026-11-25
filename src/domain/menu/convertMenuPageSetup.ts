import { resolveMenuColumnCount } from './categoryColumns';
import type { CategoryPosition, MenuStyle, Product } from './model';
import type { MenuPageSetup } from './pageModel';
import { normalizeMenuPageSetup, resolveMenuPageDimensions } from './pageSetup';
import { resolveMenuMargins } from './styleRules';

const MIN_POSITIONED_OBJECT_VISIBLE_PX = 24;
const MIN_USABLE_PAGE_HEIGHT_PX = 96;
const MIN_USABLE_PAGE_WIDTH_PX = 96;
const MIN_USABLE_COLUMN_WIDTH_PX = 48;
const MIN_USABLE_COLUMN_GAP_PX = 8;

const clampPageValue = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(minimum, value), Math.max(minimum, maximum))
);

const finitePageValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampMarginPair = (
  first: number,
  second: number,
  pageSize: number,
  minimumContentSize: number,
) => {
  const safeFirst = Math.max(0, finitePageValue(first));
  const safeSecond = Math.max(0, finitePageValue(second));
  const maximumCombinedMargin = Math.max(0, pageSize - Math.min(pageSize, minimumContentSize));
  const combinedMargin = safeFirst + safeSecond;
  if (combinedMargin <= maximumCombinedMargin || combinedMargin === 0) {
    return [safeFirst, safeSecond] as const;
  }
  const scale = maximumCombinedMargin / combinedMargin;
  return [safeFirst * scale, safeSecond * scale] as const;
};

const getSafePageMargins = (
  style: MenuStyle,
  widthPx: number,
  heightPx: number,
) => {
  const margins = resolveMenuMargins(style);
  const columnCount = Math.max(1, Math.min(style.pageSetup?.orientation === 'landscape' ? 5 : 3, Math.floor(style.categoryColumnCount || 1)));
  const minimumContentWidth = Math.min(
    widthPx,
    Math.max(
      MIN_USABLE_PAGE_WIDTH_PX,
      (columnCount * MIN_USABLE_COLUMN_WIDTH_PX)
        + (Math.max(0, columnCount - 1) * MIN_USABLE_COLUMN_GAP_PX),
    ),
  );
  const minimumContentHeight = Math.min(heightPx, MIN_USABLE_PAGE_HEIGHT_PX);
  const [left, right] = clampMarginPair(
    margins.left,
    margins.right,
    widthPx,
    minimumContentWidth,
  );
  const [top, bottom] = clampMarginPair(
    margins.top,
    margins.bottom,
    heightPx,
    minimumContentHeight,
  );
  const contentWidth = Math.max(0, widthPx - left - right);
  const maximumColumnGap = columnCount > 1
    ? Math.max(
      0,
      (contentWidth - (columnCount * MIN_USABLE_COLUMN_WIDTH_PX)) / (columnCount - 1),
    )
    : margins.columnGap;

  return {
    top,
    bottom,
    left,
    right,
    columnGap: Math.min(margins.columnGap, maximumColumnGap),
  };
};

const samePosition = (first: CategoryPosition, second: CategoryPosition) => first.pageIndex === second.pageIndex
  && first.columnIndex === second.columnIndex && first.y === second.y && first.x === second.x && first.pageX === second.pageX;

function getLandscapeCategoryColumns(style: MenuStyle, products: readonly Product[]) {
    const hiddenIds = new Set(style.hiddenProductIds);
    const visibleCategories = new Set(products.filter(product => !product.isFreeText && !hiddenIds.has(product.id))
        .map(product => product.category));
    const limit = style.columnCount === 3 ? style.categoryColumnCount || 1 : 3;
    const count = Math.min(limit, visibleCategories.size);
    return count >= 3 ? 3 : count === 2 ? 2 : 1;
}

export function convertMenuPageSetup(
    previous: MenuStyle,
    proposed: MenuPageSetup,
    renderedImageAspectRatios: ReadonlyMap<string, number>,
    products: readonly Product[],
    canIncreaseCategoryColumns: (count: number) => boolean = () => true,
): MenuStyle {
    const normalizedNextSetup = normalizeMenuPageSetup(proposed);
    const currentDimensions = resolveMenuPageDimensions(previous);
    const nextDimensions = resolveMenuPageDimensions(normalizedNextSetup);
    const toLandscape = currentDimensions.setup.orientation === 'portrait' && normalizedNextSetup.orientation === 'landscape';
    const portraitLayout = previous.portraitPageLayout;
    const restore = currentDimensions.setup.orientation === 'landscape' && normalizedNextSetup.orientation === 'portrait'
      ? portraitLayout : undefined;
    const maximum = normalizedNextSetup.orientation === 'landscape' ? 5 : 3;
    let categoryColumnCount = resolveMenuColumnCount(restore ? restore.categoryColumnCount
      : toLandscape ? getLandscapeCategoryColumns(previous, products) : previous.categoryColumnCount, maximum);
    while (categoryColumnCount > (previous.categoryColumnCount || 1) && !canIncreaseCategoryColumns(categoryColumnCount)) {
      categoryColumnCount = resolveMenuColumnCount(categoryColumnCount - 1, maximum);
    }
    const changedColumnCount = (categoryColumnCount || 1) !== (previous.categoryColumnCount || 1);
    const categoryColumnWidths = restore ? restore.categoryColumnWidths : changedColumnCount ? undefined : previous.categoryColumnWidths;
    const lastColumn = (categoryColumnCount || 1) - 1;
    const originalDimensions = restore ? resolveMenuPageDimensions(restore.setup) : currentDimensions;
    const samePortraitSize = originalDimensions.widthPx === nextDimensions.widthPx && originalDimensions.heightPx === nextDimensions.heightPx;
    const horizontalScale = nextDimensions.widthPx / currentDimensions.widthPx;
    const verticalScale = nextDimensions.heightPx / currentDimensions.heightPx;
    const savedMargins = toLandscape ? { portrait: previous.margins, portraitPadding: previous.pagePadding }
      : portraitLayout?.margins && JSON.stringify(previous.margins) === JSON.stringify(portraitLayout.margins.landscape)
        && previous.pagePadding === portraitLayout.margins.landscapePadding ? portraitLayout.margins : undefined;
    const restoreMargins = Boolean(restore && samePortraitSize && savedMargins);
    const marginStyle = restoreMargins ? { ...previous, margins: savedMargins?.portrait, pagePadding: savedMargins?.portraitPadding } : previous;
    const safeMargins = getSafePageMargins(
      { ...marginStyle, categoryColumnCount, pageSetup: normalizedNextSetup },
      nextDimensions.widthPx,
      nextDimensions.heightPx,
    );
    const currentMargins = resolveMenuMargins(marginStyle);
    const marginsWereClamped = (Object.keys(safeMargins) as Array<keyof typeof safeMargins>)
      .some((key) => Math.abs(safeMargins[key] - currentMargins[key]) > 0.01);
    const averageSafeMargin = (
      safeMargins.top + safeMargins.bottom + safeMargins.left + safeMargins.right
    ) / 4;
    const currentPagePadding = finitePageValue(marginStyle.pagePadding, averageSafeMargin);
    const pagePaddingWasClamped = currentPagePadding > averageSafeMargin;
    const minimumCategoryY = Math.min(
      safeMargins.top,
      Math.max(
        0,
        nextDimensions.heightPx - safeMargins.bottom - MIN_POSITIONED_OBJECT_VISIBLE_PX,
      ),
    );
    const maximumCategoryY = Math.max(
      minimumCategoryY,
      nextDimensions.heightPx - safeMargins.bottom - MIN_POSITIONED_OBJECT_VISIBLE_PX,
    );
    const positions: Record<string, { portrait: CategoryPosition; landscape: CategoryPosition }> = {};
    const nextCategoryPositions = previous.categoryPositions && Object.fromEntries(Object.entries(previous.categoryPositions).map(([category, current]) => {
      const saved = portraitLayout?.positions?.[category];
      const unchanged = saved && samePosition(current, saved.landscape);
      if (restore && unchanged && samePortraitSize) return [category, saved.portrait];
      const from = restore && unchanged ? saved.portrait : current;
      const xScale = restore && unchanged ? nextDimensions.widthPx / originalDimensions.widthPx : horizontalScale;
      const yScale = restore && unchanged ? nextDimensions.heightPx / originalDimensions.heightPx : verticalScale;
      const next = {
        ...from,
        columnIndex: restore || (toLandscape && changedColumnCount) ? Math.min(from.columnIndex, lastColumn) : from.columnIndex,
        pageX: from.pageX === undefined ? undefined
          : clampPageValue(from.pageX * xScale, 0, nextDimensions.widthPx - MIN_POSITIONED_OBJECT_VISIBLE_PX),
        y: clampPageValue(finitePageValue(from.y, minimumCategoryY) * yScale, minimumCategoryY, maximumCategoryY),
      };
      if (toLandscape) positions[category] = { portrait: current, landscape: next };
      else if (!restore && unchanged) positions[category] = { portrait: saved.portrait, landscape: next };
      return [category, next];
    }));
    const nextFloatingText = previous.floatingText?.map((item) => ({
      ...item,
      x: clampPageValue(
        finitePageValue(item.x) * horizontalScale,
        0,
        nextDimensions.widthPx - MIN_POSITIONED_OBJECT_VISIBLE_PX,
      ),
      y: clampPageValue(
        finitePageValue(item.y) * verticalScale,
        0,
        nextDimensions.heightPx - MIN_POSITIONED_OBJECT_VISIBLE_PX,
      ),
    }));
    const nextAddedImages = previous.addedImages?.map((image) => {
      const boundingBoxAspectRatio = image.boundingBox
        && image.boundingBox.width > 0
        && image.boundingBox.height > 0
        ? image.boundingBox.height / image.boundingBox.width
        : null;
      const measuredAspectRatio = renderedImageAspectRatios.get(image.id)
        || boundingBoxAspectRatio;
      const aspectRatio = measuredAspectRatio
        && Number.isFinite(measuredAspectRatio)
        && measuredAspectRatio > 0
        ? measuredAspectRatio
        : null;
      const currentWidth = Math.max(0, finitePageValue(image.width));
      const maximumWidthByHeight = aspectRatio
        ? nextDimensions.heightPx / aspectRatio
        : Number.POSITIVE_INFINITY;
      const width = Math.min(
        currentWidth,
        nextDimensions.widthPx,
        maximumWidthByHeight,
      );
      const height = aspectRatio
        ? width * aspectRatio
        : Math.min(MIN_POSITIONED_OBJECT_VISIBLE_PX, nextDimensions.heightPx);

      return {
        ...image,
        x: clampPageValue(
          finitePageValue(image.x) * horizontalScale,
          0,
          nextDimensions.widthPx - width,
        ),
        y: clampPageValue(
          finitePageValue(image.y) * verticalScale,
          0,
          nextDimensions.heightPx - height,
        ),
        width,
      };
    });
    const nextMargins = restoreMargins ? savedMargins?.portrait : marginsWereClamped ? safeMargins : previous.margins;
    const nextPagePadding = restoreMargins ? savedMargins?.portraitPadding : marginsWereClamped || pagePaddingWasClamped
      ? Math.min(Math.max(0, currentPagePadding), averageSafeMargin)
      : previous.pagePadding;
    const landscapeMargins = savedMargins && { ...savedMargins, landscape: nextMargins, landscapePadding: nextPagePadding };
    const nextPortraitLayout = toLandscape ? {
      setup: currentDimensions.setup,
      categoryColumnCount: previous.categoryColumnCount,
      categoryColumnWidths: previous.categoryColumnWidths,
      columnCount: previous.columnCount,
      positions,
      margins: landscapeMargins,
    } : !restore && portraitLayout ? { ...portraitLayout, positions, margins: landscapeMargins } : undefined;

    return {
      ...previous,
      pageSetup: normalizedNextSetup,
        portraitPageLayout: nextPortraitLayout,
        categoryColumnCount,
        categoryColumnWidths,
        columnCount: resolveMenuColumnCount(restore?.columnCount ?? previous.columnCount, maximum),
        categoryPlacements: restore && previous.categoryPlacements
          ? Object.fromEntries(Object.entries(previous.categoryPlacements).map(([category, placement]) => [
            category, placement.columnIndex > lastColumn ? { ...placement, columnIndex: lastColumn } : placement,
          ])) : previous.categoryPlacements,
      categoryPositions: nextCategoryPositions,
      floatingText: nextFloatingText,
      addedImages: nextAddedImages,
        margins: nextMargins,
        pagePadding: nextPagePadding,
      name: 'Custom',
    };
}
