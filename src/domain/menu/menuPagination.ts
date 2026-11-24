import { getItemFormattingStyle } from './itemFormatting';
import { headingIsOnPage, headingMeasurementKey } from './menuHeadings';
import { categoryName } from './categoryName';
import type { Product, MenuStyle } from './model';
import { resolveMenuMargins, resolveMinimumFontSize, resolveMenuContentSpacing, clampFontSize, resolveProductImageFrame } from './styleRules';
import { resolveMenuPageDimensions } from './pageSetup';
import { normalizeColumnWidths } from './categoryColumns';
import { templateHeaderExtra, templateCategoryExtra } from '../templates/templateDesign';
import { FREE_TEXT_PREFIX, CATEGORY_CHUNK_GAP_PX } from './flow';
import { formatMenuPrice, resolveMenuPriceDecimalPlaces } from './price';

const PRODUCT_GRID_GAP_PX = 24;

const PRODUCT_ITEM_HORIZONTAL_PADDING_PX = 16;

const PRODUCT_ITEM_VERTICAL_PADDING_PX = 0;

const FREE_TEXT_VERTICAL_PADDING_PX = 16;

const PRODUCT_CARD_VERTICAL_PADDING_PX = 24;

const PRODUCT_CARD_IMAGE_HEIGHT_PX = 168;

export type PageItem =
    | { type: 'main-header'; title?: boolean; subtitle?: boolean }
    | { type: 'category-header'; data: string; category: string }
    | { type: 'product-item'; data: Product; category: string }
    | { type: 'free-text-row'; data: Product[]; category: string }
    | { type: 'product-row'; data: Product[]; category: string };

export interface CategoryChunkLayout {
    chunkId: string;
    category: string;
    startsCategory: boolean;
    columnIndex: number;
    items: PageItem[];
    estimatedHeight: number;
    flowOffsetBefore?: number;
}

export interface PageColumnLayout {
    columnIndex: number;
    chunks: CategoryChunkLayout[];
    estimatedHeight: number;
}

export interface PageLayout {
    blankPageId?: string;
    headerCopy?: boolean;
    mainHeader: PageItem | null;
    columns: PageColumnLayout[];
    flatItems: PageItem[];
    columnCount?: number;
}

export interface CategoryPlacementAssignment {
    pageIndex: number;
    columnIndex: number;
}

export interface PaginationOptions {
    splitCategoryAcrossPages?: boolean;
    measuredHeights?: ReadonlyMap<string, number>;
}

export function getSavedCategoryPlacements(style: MenuStyle): Record<string, CategoryPlacementAssignment> | null {
    const positions = Object.fromEntries(Object.entries(style.categoryPositions || {}).map(([category, position]) => [
        category, { pageIndex: position.pageIndex, columnIndex: position.columnIndex },
    ]));
    const placements = { ...positions, ...style.categoryPlacements };
    return Object.keys(placements).length ? placements : null;
}

export const getPaginationItemKey = (item: PageItem) => {
    if (item.type === 'main-header') return item.type;
    const data = item.type === 'category-header' ? item.data
        : item.type === 'product-item' ? item.data.id : item.data.map((product) => product.id);
    return JSON.stringify([item.type, data]);
};

export const getPaginationHeightKey = (itemKey: string, width: number) => `${itemKey}:${Math.round(width)}`;

interface MutablePage extends PageLayout {
    _columnHeights: number[];
}

const getSafeLineCount = (text: string, usableWidth: number, charWidth: number) => {
    const charsPerLine = Math.max(1, Math.floor(usableWidth / Math.max(1, charWidth)));
    const paragraphs = (text || '').split(/\r?\n/);

    return Math.max(1, paragraphs.reduce((total, paragraph) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return total + 1;

        let lines = 1;
        let lineLength = 0;
        words.forEach((word) => {
            const nextLength = lineLength === 0 ? word.length : lineLength + 1 + word.length;
            if (nextLength <= charsPerLine) {
                lineLength = nextLength;
                return;
            }

            if (lineLength > 0) lines += 1;
            const additionalLines = Math.floor((word.length - 1) / charsPerLine);
            lines += additionalLines;
            lineLength = word.length - (additionalLines * charsPerLine);
        });

        return total + lines;
    }, 0));
};

const getSafeCustomMarginTop = (product: Product) => {
    const margin = Number(product.customMarginTop);
    return Number.isFinite(margin) ? Math.max(0, margin) : 0;
};

const getProductGridGap = (style: MenuStyle) => {
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = style.categoryColumnCount || 1;
    if (categoryColumnCount > 1) return productColumnCount > 2 ? 4 : 8;
    if (productColumnCount > 2) return 8;
    if (productColumnCount > 1) return 12;
    return PRODUCT_GRID_GAP_PX;
};

export const getProductCardImageLimit = (style: MenuStyle, categoryColumnCount: number = style.categoryColumnCount || 1) => {
    const productColumnCount = style.columnCount || 1;
    if (categoryColumnCount > 1 || productColumnCount >= 3) return 96;
    if (productColumnCount === 2) return 120;
    return PRODUCT_CARD_IMAGE_HEIGHT_PX;
};

export const getProductListImageLimit = (categoryColumnCount: number) => categoryColumnCount === 2 ? 88 : 112;
export function getCategoryPhotoSizing(style: MenuStyle, categoryColumnCount: number = style.categoryColumnCount || 1) {
    const usesProductRows = style.layoutMode !== 'list' || (style.columnCount || 1) > 1;
    return {
        limit: usesProductRows ? getProductCardImageLimit(style, categoryColumnCount) : getProductListImageLimit(categoryColumnCount),
        widthFraction: usesProductRows || categoryColumnCount >= 3 ? 1 : 0.42,
        titleReserve: 64,
    };
}

export const getPaginationBottomInset = (style: MenuStyle) => {
    const margin = resolveMenuMargins(style).bottom;
    if (style.showPageNumbers === false) return margin;
    const pageNumberSize = Math.max(resolveMinimumFontSize(style), Math.min(50, Number(style.elementStyles?.pageNumber?.fontSize) || 14));
    return Math.max(margin, 24 + pageNumberSize * 0.6);
};

const getCategoryColumnWidth = (
    style: MenuStyle,
    categoryColumnCountOverride?: number,
    columnIndex?: number,
): number => {
    const margins = resolveMenuMargins(style);
    const usableWidth = resolveMenuPageDimensions(style).widthPx - margins.left - margins.right;
    const categoryColumnCount = categoryColumnCountOverride || style.categoryColumnCount || 1;
    const availableColumnsWidth = usableWidth - (margins.columnGap * (categoryColumnCount - 1));
    const columnWidths = normalizeColumnWidths(style.categoryColumnWidths, categoryColumnCount);
    const ratio = Number.isFinite(columnIndex)
        ? columnWidths[Math.max(0, Math.min(categoryColumnCount - 1, Number(columnIndex)))]
        : Math.min(...columnWidths);
    return Math.max(
        72,
        availableColumnsWidth * ratio,
    );
};

const getPageHeader = (style: MenuStyle, index: number, legacyCopy = false): Extract<PageItem, { type: 'main-header' }> | null => {
    const title = headingIsOnPage(style, 'menuTitle', index, legacyCopy);
    const subtitle = headingIsOnPage(style, 'menuSubtitle', index, legacyCopy);
    return title || subtitle ? { type: 'main-header', title, subtitle } : null;
};

const getMainHeaderHeight = (style: MenuStyle, header: PageItem | null, measuredHeights?: PaginationOptions['measuredHeights']) => {
    if (header?.type !== 'main-header') return 0;
    const title = header.title ?? true;
    const subtitle = header.subtitle ?? Boolean(style.menuSubtitle?.trim());
    const legacyMetric = title && subtitle === Boolean(style.menuSubtitle?.trim()) ? measuredHeights?.get('main-header') : undefined;
    const measured = measuredHeights?.get(headingMeasurementKey(title, subtitle)) ?? legacyMetric;
    if (measured !== undefined) return measured;
    const spacing = resolveMenuContentSpacing(style);
    const titleSize = clampFontSize(style, 'menuTitle', style.elementStyles?.menuTitle?.fontSize, 48);
    const subtitleSize = clampFontSize(style, 'menuSubtitle', style.elementStyles?.menuSubtitle?.fontSize, 18);
    return (title ? titleSize * 1.22 : 0) + (subtitle ? subtitleSize * 1.35 : 0)
        + (title && subtitle ? style.elementStyles?.menuTitle?.marginBottom ?? 10 : 0)
        + spacing.headerToContent + templateHeaderExtra(style);
};

const getPaginationContentHeight = (style: MenuStyle) => Math.max(
    1,
    resolveMenuPageDimensions(style).heightPx - resolveMenuMargins(style).top - getPaginationBottomInset(style),
);

/** Keep each placed category's offset relative to the content start when a heading is added or removed. */
export function reflowPositionsForMenuHeadings(
    previous: MenuStyle,
    next: MenuStyle,
    pages: PageLayout[],
    measuredHeights: PaginationOptions['measuredHeights'],
): MenuStyle {
    if (!previous.categoryPositions) return next;
    const heightChanges = pages.map((page, index) =>
        getMainHeaderHeight(next, getPageHeader(next, index, page.headerCopy), measuredHeights)
        - getMainHeaderHeight(previous, page.mainHeader, measuredHeights));
    if (!heightChanges.some(Boolean)) return next;
    const top = resolveMenuMargins(next).top;
    return {
        ...next,
        categoryPositions: Object.fromEntries(Object.entries(previous.categoryPositions).map(([category, position]) => [
            category,
            !category.startsWith(FREE_TEXT_PREFIX) && position.pageX === undefined && heightChanges[position.pageIndex]
                ? { ...position, y: Math.max(top, position.y + heightChanges[position.pageIndex]) }
                : position,
        ])),
    };
}

const getEmptyColumnHeight = (style: MenuStyle, baseHeight: number, options: PaginationOptions) => {
    const title = style.headingPages?.menuTitle === 'all' && headingIsOnPage(style, 'menuTitle', 0);
    const subtitle = style.headingPages?.menuSubtitle === 'all' && headingIsOnPage(style, 'menuSubtitle', 0);
    const headerHeight = title || subtitle
        ? getMainHeaderHeight(style, { type: 'main-header', title, subtitle }, options.measuredHeights)
        : 0;
    return Math.max(1, baseHeight - headerHeight);
};

export function getPaginationColumnLimit(style: MenuStyle, page: PageLayout, options: PaginationOptions) {
    return getPaginationContentHeight(style) - getMainHeaderHeight(style, page.mainHeader, options.measuredHeights);
}

// Helper function to estimate item height dynamically
export const calculateItemHeight = (
    product: Product,
    style: MenuStyle,
    isRowLayout: boolean,
    columnCount: number = 1,
    availableWidth: number = getCategoryColumnWidth(style),
    categoryColumnCountOverride?: number
): number => {
    if (!product.isFreeText) style = getItemFormattingStyle(style, 'product', product.id);
    const spacing = resolveMenuContentSpacing(style);
    const fontSize = product.isFreeText
        ? clampFontSize(style, 'freeText', product.styles?.fontSize || style.elementStyles?.productName?.fontSize, 18)
        : clampFontSize(style, 'productName', style.elementStyles?.productName?.fontSize, 18);

    const descSize = clampFontSize(style, 'productDescription', style.elementStyles?.productDescription?.fontSize, 14);
    const containerWidth = Math.max(120, availableWidth);
    const categoryColumnCount = categoryColumnCountOverride || style.categoryColumnCount || 1;

    if (product.isFreeText) {
        const charWidth = fontSize * 0.55;
        const usableColWidth = Math.max(80, containerWidth - PRODUCT_ITEM_HORIZONTAL_PADDING_PX);
        const lines = getSafeLineCount(product.name, usableColWidth, charWidth);
        const productCategory = product.category || '';
        const layoutMargin = productCategory.startsWith(FREE_TEXT_PREFIX) ? 0 : getSafeCustomMarginTop(product);

        return (fontSize * 1.6 * lines) + layoutMargin + FREE_TEXT_VERTICAL_PADDING_PX + 8;
    }

    const priceSize = clampFontSize(style, 'productPrice', style.elementStyles?.productPrice?.fontSize, 18);
    const imgScale = style.imageScale || 1;
    const photoAlignment = style.productPhotoAlignments?.[product.id] ?? style.productPhotoAlignmentDefault;
    const photoRatio = style.productImageFrame === 'circle' ? 1 : style.productPhotoRatio || 1;
    let contentHeight = 0;

    if (isRowLayout) {
        const productGridGap = getProductGridGap(style);
        const usableColWidth = Math.max(40, (containerWidth - (productGridGap * (columnCount - 1))) / columnCount);
        const sidePhoto = photoAlignment === 'left' || photoAlignment === 'right';
        const photoHeight = style.showImages && product.image
            ? Math.min(usableColWidth * (sidePhoto ? .42 : 1), getProductCardImageLimit(style) * imgScale * Math.min(1, photoRatio)) / photoRatio
            : 0;
        if (photoHeight && !sidePhoto) {
            const useBackground = !photoAlignment && resolveProductImageFrame(style, true) === 'template' && style.design?.image === 'background';
            contentHeight += useBackground ? 36 * imgScale : photoHeight;
        }
        const cardHorizontalPadding = categoryColumnCount > 1 || columnCount > 2 ? 12 : columnCount > 1 ? 16 : 32;
        const textContentWidth = Math.max(32, usableColWidth - cardHorizontalPadding - (sidePhoto && photoHeight ? photoHeight * photoRatio + 10 : 0));
        const nameCharWidth = fontSize * 0.6;
        const editButtonReserve = categoryColumnCount > 1 || columnCount > 1 ? 24 : 40;
        const nameLines = getSafeLineCount(product.name, Math.max(24, textContentWidth - editButtonReserve), nameCharWidth);
        contentHeight += (fontSize * 1.6 * nameLines) + spacing.productNameToDescription;

        if (style.showPrices !== false) contentHeight += (priceSize * 1.6) + 6;

        if (product.description) {
            const descCharWidth = descSize * 0.55;
            const lines = getSafeLineCount(product.description, textContentWidth, descCharWidth);
            contentHeight += descSize * 1.6 * lines;
        }

        const cardVerticalPadding = categoryColumnCount > 1 || columnCount > 2 ? 12 : columnCount > 1 ? 16 : PRODUCT_CARD_VERTICAL_PADDING_PX;
        const compactPadding = Math.min(cardVerticalPadding, spacing.betweenProducts * 2);
        contentHeight = Math.max(contentHeight, sidePhoto ? photoHeight : 0) + compactPadding + 28;
    } else {
        const hasImage = Boolean(style.showImages && product.image);
        const stackPhoto = photoAlignment === 'center' || categoryColumnCount >= 3 && !photoAlignment;
        const imgHeight = hasImage
            ? Math.min(getProductListImageLimit(categoryColumnCount) * imgScale * Math.min(1, photoRatio), containerWidth * (stackPhoto ? 1 : .42)) / photoRatio
            : 0;
        const compactLayout = categoryColumnCount > 1;
        const innerWidth = Math.max(80, containerWidth);
        const imageGap = compactLayout ? 8 : 16;
        const textWidth = hasImage && !stackPhoto
            ? Math.max(80, innerWidth - imgHeight * photoRatio - imageGap)
            : innerWidth;

        let textHeight = 0;

        const nameCharWidth = fontSize * 0.6;
        const showPrice = style.showPrices !== false;
        const formattedPriceLength = formatMenuPrice(product.price, style).length;
        const priceColumnReserve = showPrice
            ? Math.max(36, formattedPriceLength * priceSize * 0.58) + spacing.productNameToPrice
            : 0;
        const editButtonReserve = compactLayout ? 0 : 48;
        const nameWidth = product.name.length * nameCharWidth;
        const wrapsPrice = showPrice && nameWidth + priceColumnReserve + editButtonReserve > textWidth;
        const nameLines = getSafeLineCount(
            product.name,
            Math.max(48, textWidth - editButtonReserve - (wrapsPrice ? 0 : priceColumnReserve)),
            nameCharWidth,
        );
        const nameHeight = fontSize * 1.375 * nameLines;
        const priceHeight = showPrice ? priceSize * 1.375 : 0;
        const nameAndPriceHeight = wrapsPrice
            ? nameHeight + priceHeight + 2
            : Math.max(nameHeight, priceHeight);
        textHeight += nameAndPriceHeight;

        if (product.description) {
            const descCharWidth = descSize * 0.55;
            const lines = getSafeLineCount(product.description, textWidth, descCharWidth);
            const descriptionLineHeight = Number(style.elementStyles?.productDescription?.lineHeight) || 1.625;
            textHeight += (descSize * descriptionLineHeight * lines) + spacing.productNameToDescription;
        }

        contentHeight = stackPhoto && hasImage
            ? imgHeight + textHeight + PRODUCT_ITEM_VERTICAL_PADDING_PX + 8
            : Math.max(imgHeight, textHeight) + PRODUCT_ITEM_VERTICAL_PADDING_PX + 2;
    }

    return contentHeight + getSafeCustomMarginTop(product) + spacing.betweenProducts;
};

const buildPageFlatItems = (page: PageLayout) => {
    const bodyItems = page.columns.flatMap((column) =>
        column.chunks.flatMap((chunk) => chunk.items)
    );

    return page.mainHeader ? [page.mainHeader, ...bodyItems] : bodyItems;
};

const buildCategoryProductItems = (
    visibleProducts: Product[],
    category: string,
    isRowLayout: boolean,
    productColumnCount: number
): PageItem[] => {
    const items: PageItem[] = [];
    let currentRow: Product[] = [];
    let currentFreeTextRow: Product[] = [];
    const flushRow = () => {
        if (currentRow.length === 0) return;
        items.push({
            type: 'product-row',
            data: currentRow,
            category,
        });
        currentRow = [];
    };
    const flushFreeTextRow = () => {
        if (currentFreeTextRow.length === 0) return;
        items.push({
            type: currentFreeTextRow.length === 1 ? 'product-item' : 'free-text-row',
            data: currentFreeTextRow.length === 1 ? currentFreeTextRow[0] : currentFreeTextRow,
            category,
        } as PageItem);
        currentFreeTextRow = [];
    };

    visibleProducts.forEach((product) => {
        if (product.isFreeText) {
            flushRow();
            currentFreeTextRow.push(product);
            return;
        }

        flushFreeTextRow();
        if (!isRowLayout) {
            items.push({ type: 'product-item', data: product, category });
            return;
        }
        currentRow.push(product);
        if (currentRow.length >= productColumnCount) flushRow();
    });

    flushRow();
    flushFreeTextRow();
    return items;
};

const createPageItemHeightCalculator = (
    style: MenuStyle,
    categoryColumnCountOverride?: number,
    categoryColumnIndex?: number,
    measuredHeights?: PaginationOptions['measuredHeights'],
) => {
    const spacing = resolveMenuContentSpacing(style);
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = categoryColumnCountOverride || style.categoryColumnCount || 1;
    const categoryColumnWidth = getCategoryColumnWidth(style, categoryColumnCount, categoryColumnIndex);

    return (item: PageItem) => {
        const measured = measuredHeights?.get(getPaginationHeightKey(getPaginationItemKey(item), categoryColumnWidth));
        if (measured !== undefined) return measured;
        if (item.type === 'category-header') {
            const categoryStyle = getItemFormattingStyle(style, 'category', item.data).elementStyles.category || {};
            const categoryFontSize = clampFontSize(style, 'category', categoryStyle.fontSize, 24);
            const editButtonReserve = categoryColumnCount > 1 ? 32 : 52;
            const dividerReserve = categoryStyle.textAlign === 'center' ? 64 : 32;
            const categoryImage = style.showCategoryImages !== false ? style.categoryImages?.[item.data] : undefined;
            const categoryImageScale = style.categoryImageScale || 1;
            const aspect = Math.min(3, Math.max(.375, style.categoryPhotoRatio ?? (categoryImage?.width || 1) / (categoryImage?.height || 1)));
            const { limit, widthFraction, titleReserve } = getCategoryPhotoSizing(style, categoryColumnCount);
            const centeredPhoto = (categoryImage?.alignment ?? style.categoryPhotoAlignmentDefault) === 'center';
            const maxImageWidth = centeredPhoto ? categoryColumnWidth
                : Math.min(categoryColumnWidth * widthFraction, Math.max(0, categoryColumnWidth - titleReserve));
            const imageWidth = categoryImage?.url ? Math.min(maxImageWidth, limit * categoryImageScale * Math.min(aspect, 1)) : 0;
            const imageReserve = imageWidth && !centeredPhoto ? imageWidth + 8 : 0;
            const letterSpacing = categoryStyle.letterSpacing || 0;
            const categoryCharWidth = (categoryFontSize * 0.6) + letterSpacing;
            const lines = getSafeLineCount(
                categoryName(item.data),
                Math.max(24, categoryColumnWidth - editButtonReserve - dividerReserve - imageReserve),
                categoryCharWidth
            );
            const imageHeight = imageWidth / aspect;
            const textHeight = Math.max(categoryFontSize * 1.25 * lines, 28);
            return (centeredPhoto && imageHeight ? textHeight + imageHeight + 4 : Math.max(textHeight, imageHeight))
                + spacing.categoryToProduct + 8 + templateCategoryExtra(style);
        }
        if (item.type === 'product-item') return calculateItemHeight(item.data, style, false, 1, categoryColumnWidth, categoryColumnCount);
        if (item.type === 'free-text-row') {
            const horizontalGap = 8;
            let rowWidth = 0;
            let rowHeight = 0;
            let totalHeight = 0;
            (item.data as Product[]).forEach((product) => {
                const fontSize = clampFontSize(style, 'freeText', product.styles?.fontSize, 18);
                const estimatedNaturalWidth = Math.max(36, Math.min(categoryColumnWidth, (product.name.length * fontSize * 0.58) + 8));
                const itemWidth = Math.max(36, Math.min(categoryColumnWidth, Number(product.freeTextWidth) || estimatedNaturalWidth));
                const itemHeight = calculateItemHeight(product, style, false, 1, itemWidth, categoryColumnCount);
                if (rowWidth > 0 && rowWidth + horizontalGap + itemWidth > categoryColumnWidth) {
                    totalHeight += rowHeight + horizontalGap;
                    rowWidth = 0;
                    rowHeight = 0;
                }
                rowWidth += (rowWidth > 0 ? horizontalGap : 0) + itemWidth;
                rowHeight = Math.max(rowHeight, itemHeight);
            });
            return totalHeight + rowHeight;
        }
        if (item.type === 'product-row') {
            const rowHeight = Math.max(
                ...(item.data as Product[]).map((product) => calculateItemHeight(product, style, true, productColumnCount, categoryColumnWidth, categoryColumnCount))
            );
            return rowHeight;
        }
        return 0;
    };
};

const createLockedPage = (categoryColumnCount: number, mainHeader: PageItem | null): PageLayout => ({
    mainHeader,
    columns: Array.from({ length: categoryColumnCount }, (_, columnIndex) => ({
        columnIndex,
        chunks: [],
        estimatedHeight: 0,
    })),
    flatItems: [],
    columnCount: categoryColumnCount,
});

const createCategoryChunkIdFactory = () => {
    const counters = new Map<string, number>();

    return (category: string) => {
        const categoryChunkIndex = counters.get(category) || 0;
        counters.set(category, categoryChunkIndex + 1);
        return `${category}::chunk-${categoryChunkIndex}`;
    };
};

const FIT_TOLERANCE_PX = 0.25;

const findCategoryColumn = (
    columns: PageColumnLayout[],
    preferredIndex: number,
    emptyColumnHeight: number,
    requiredHeight: (index: number) => number,
    remainingHeight: (index: number) => number,
) => {
    const columnOrder = columns.map((_, index) => (preferredIndex + index) % columns.length);
    const fittingColumn = columnOrder.find((index) => remainingHeight(index) + FIT_TOLERANCE_PX >= requiredHeight(index));
    if (fittingColumn !== undefined) return fittingColumn;
    if (columnOrder.some((index) => requiredHeight(index) <= emptyColumnHeight)) return undefined;
    // Allow oversized items to render in an empty column if advancing cannot make them fit.
    return columnOrder.find((index) => columns[index].estimatedHeight === 0);
};

const buildLockedPagination = (
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    sortedCategories: string[],
    categoryPlacementAssignments: Record<string, CategoryPlacementAssignment>,
    isHidden: (id: string) => boolean,
    options: PaginationOptions
): PageLayout[] => {
    const categoryColumnCount = style.categoryColumnCount || 1;
    const margins = resolveMenuMargins(style);
    const baseColumnHeight = getPaginationContentHeight(style);
    const headerHeight = (page: PageLayout) => getMainHeaderHeight(style, page.mainHeader, options.measuredHeights);
    const emptyColumnHeight = getEmptyColumnHeight(style, baseColumnHeight, options);
    const normalizePlacement = (placement?: CategoryPlacementAssignment | null): CategoryPlacementAssignment => {
        const pageIndex = Number(placement?.pageIndex);
        const columnIndex = Number(placement?.columnIndex);

        return {
            pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
            columnIndex: Number.isFinite(columnIndex) ? Math.max(0, Math.min(categoryColumnCount - 1, Math.floor(columnIndex))) : 0,
        };
    };
    const getLockedPageColumnCount = (_pageIndex: number) => categoryColumnCount;
    const pages: PageLayout[] = [createLockedPage(getLockedPageColumnCount(0), getPageHeader(style, 0))];
    const getNextChunkId = createCategoryChunkIdFactory();
    let fallbackPlacement: CategoryPlacementAssignment = { pageIndex: 0, columnIndex: 0 };

    const hasChunks = (column: PageColumnLayout) => column.estimatedHeight > 0;

    const ensurePage = (pageIndex: number) => {
        const safePageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0;
        while (pages.length <= safePageIndex) {
            pages.push(createLockedPage(getLockedPageColumnCount(pages.length), getPageHeader(style, pages.length)));
        }
        return pages[safePageIndex];
    };

    const getFlowOffsetBefore = (
        page: PageLayout,
        column: PageColumnLayout,
        placement: CategoryPlacementAssignment,
        category: string,
        height: number,
    ) => {
        const requestedPosition = style.categoryPositions?.[category];
        if (
            !requestedPosition
            || requestedPosition.pageIndex !== placement.pageIndex
            || requestedPosition.columnIndex !== placement.columnIndex
        ) return 0;

        const contentStartY = margins.top + headerHeight(page);
        const requestedOffset = Math.max(0, requestedPosition.y - contentStartY);
        const normalGap = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;
        const naturalOffset = column.estimatedHeight + normalGap;
        const remainingHeight = baseColumnHeight - headerHeight(page) - naturalOffset;
        return Math.max(0, Math.min(requestedOffset - naturalOffset, remainingHeight - height));
    };

    const pushLockedChunk = (
        placement: CategoryPlacementAssignment,
        category: string,
        startsCategory: boolean,
        items: PageItem[],
        estimatedHeight: number,
        flowOffsetBefore = 0,
    ) => {
        const page = ensurePage(placement.pageIndex);
        const column = page.columns[Math.max(0, Math.min(placement.columnIndex, page.columns.length - 1))];
        const gapBeforeChunk = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;

        column.chunks.push({
            chunkId: getNextChunkId(category),
            category,
            startsCategory,
            columnIndex: column.columnIndex,
            items,
            estimatedHeight,
            flowOffsetBefore,
        });
        column.estimatedHeight += estimatedHeight + gapBeforeChunk + flowOffsetBefore;
    };

    const advancePlacement = (placement: CategoryPlacementAssignment): CategoryPlacementAssignment => {
        const page = ensurePage(placement.pageIndex);
        return placement.columnIndex < page.columns.length - 1
            ? { pageIndex: placement.pageIndex, columnIndex: placement.columnIndex + 1 }
            : { pageIndex: placement.pageIndex + 1, columnIndex: 0 };
    };

    const getRemainingHeight = (placement: CategoryPlacementAssignment) => {
        const page = ensurePage(placement.pageIndex);
        const column = page.columns[Math.max(0, Math.min(placement.columnIndex, page.columns.length - 1))];
        const columnLimit = baseColumnHeight - headerHeight(page);
        const gapBeforeChunk = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;
        return columnLimit - column.estimatedHeight - gapBeforeChunk;
    };

    const calculators = Array.from({ length: categoryColumnCount }, (_, columnIndex) => (
        createPageItemHeightCalculator(style, categoryColumnCount, columnIndex, options.measuredHeights)
    ));

    sortedCategories.forEach((category) => {
        const categoryProducts = groupedProducts[category];
        if (!categoryProducts || categoryProducts.length === 0) return;

        const visibleProducts = categoryProducts.filter((product) => !isHidden(product.id));
        if (visibleProducts.length === 0) return;

        const freePosition = style.categoryPositions?.[category];
        const isDetachedFreeText = category.startsWith(FREE_TEXT_PREFIX) && Boolean(freePosition);
        const assignedPlacement = categoryPlacementAssignments[category];
        const placement = normalizePlacement(
            freePosition
                ? { pageIndex: freePosition.pageIndex, columnIndex: freePosition.columnIndex }
                : assignedPlacement || fallbackPlacement
        );
        if (!isDetachedFreeText && freePosition?.pageX === undefined) fallbackPlacement = placement;

        if (category.startsWith(FREE_TEXT_PREFIX)) {
            let remainingItems: PageItem[] = visibleProducts.map((product) => ({
                type: 'product-item',
                data: product,
                category,
            }));
            let currentPlacement = placement;

            if (isDetachedFreeText) {
                const page = ensurePage(currentPlacement.pageIndex);
                const column = page.columns[Math.max(0, Math.min(currentPlacement.columnIndex, page.columns.length - 1))];
                column.chunks.push({
                    chunkId: getNextChunkId(category),
                    category,
                    startsCategory: false,
                    columnIndex: column.columnIndex,
                    items: remainingItems,
                    estimatedHeight: remainingItems.reduce((total, item) => total + calculators[column.columnIndex](item), 0),
                    flowOffsetBefore: 0,
                });
                return;
            }

            while (remainingItems.length > 0) {
                const availableHeight = getRemainingHeight(currentPlacement);
                const page = ensurePage(currentPlacement.pageIndex);
                const column = page.columns[Math.max(0, Math.min(currentPlacement.columnIndex, page.columns.length - 1))];
                if (availableHeight <= 0 && hasChunks(column)) {
                    currentPlacement = advancePlacement(currentPlacement);
                    continue;
                }

                const chunkItems: PageItem[] = [];
                let chunkHeight = 0;
                while (remainingItems.length > 0) {
                    const itemHeight = calculators[currentPlacement.columnIndex](remainingItems[0]);
                    const fits = chunkHeight + itemHeight <= availableHeight;
                    if (!fits && chunkItems.length > 0) break;
                    if (!fits && hasChunks(column)) break;
                    chunkItems.push(remainingItems.shift()!);
                    chunkHeight += itemHeight;
                    if (!fits) break;
                }

                if (chunkItems.length === 0) {
                    currentPlacement = advancePlacement(currentPlacement);
                    continue;
                }

                pushLockedChunk(currentPlacement, category, false, chunkItems, chunkHeight);
                if (remainingItems.length > 0) currentPlacement = advancePlacement(currentPlacement);
            }
            fallbackPlacement = currentPlacement;
            return;
        }

        const isRowLayout = style.layoutMode === 'grid' || style.layoutMode === 'cards' || (style.columnCount || 1) > 1;
        const productColumnCount = style.columnCount || 1;
        const contentItems = buildCategoryProductItems(visibleProducts, category, isRowLayout, productColumnCount);

        const headerItem: PageItem = { type: 'category-header', data: category, category };
        const fullHeights = calculators.map((calculateHeight) => (
            calculateHeight(headerItem) + contentItems.reduce((sum, item) => sum + calculateHeight(item), 0)
        ));
        const keepTogether = !(style.splitCategoryAcrossPages ?? options.splitCategoryAcrossPages) && fullHeights.some((height) => height <= emptyColumnHeight);
        let remainingItems = [...contentItems];
        let currentPlacement = placement;
        let startsCategory = true;

        if (freePosition?.pageX !== undefined) {
            const column = ensurePage(placement.pageIndex).columns[placement.columnIndex];
            const measure = calculators[column.columnIndex];
            const items: PageItem[] = [headerItem];
            let height = measure(headerItem);
            const available = resolveMenuPageDimensions(style).heightPx - margins.bottom - freePosition.y;
            while (remainingItems.length && height + measure(remainingItems[0]) <= available) {
                const item = remainingItems.shift()!;
                items.push(item);
                height += measure(item);
            }
            column.chunks.push({ chunkId: getNextChunkId(category), category, startsCategory: true,
                columnIndex: placement.columnIndex, items, estimatedHeight: height, flowOffsetBefore: 0 });
            if (!remainingItems.length) return;
            startsCategory = false;
            currentPlacement = advancePlacement(placement);
        }

        while (remainingItems.length > 0) {
            const page = ensurePage(currentPlacement.pageIndex);
            const requiredHeight = (index: number) => {
                const calculateHeight = calculators[index];
                const firstItemHeight = calculateHeight(remainingItems[0]);
                if (!startsCategory) return firstItemHeight;
                return keepTogether ? fullHeights[index] : calculateHeight(headerItem) + firstItemHeight;
            };
            const fittingColumn = findCategoryColumn(page.columns, currentPlacement.columnIndex, emptyColumnHeight, requiredHeight,
                (columnIndex) => getRemainingHeight({ pageIndex: currentPlacement.pageIndex, columnIndex }));
            if (fittingColumn === undefined) {
                currentPlacement = { pageIndex: currentPlacement.pageIndex + 1, columnIndex: 0 };
                continue;
            }
            currentPlacement = { ...currentPlacement, columnIndex: fittingColumn };

            const column = page.columns[currentPlacement.columnIndex];
            const currentCalculator = calculators[currentPlacement.columnIndex];
            const currentHeaderItemHeight = startsCategory ? currentCalculator(headerItem) : 0;
            const naturalHeight = getRemainingHeight(currentPlacement);
            const positionReservedHeight = startsCategory && fullHeights[currentPlacement.columnIndex] <= naturalHeight
                ? fullHeights[currentPlacement.columnIndex]
                : requiredHeight(currentPlacement.columnIndex);
            const flowOffsetBefore = startsCategory
                ? getFlowOffsetBefore(page, column, currentPlacement, category, positionReservedHeight)
                : 0;
            const availableHeight = naturalHeight - flowOffsetBefore + FIT_TOLERANCE_PX;
            const chunkItems: PageItem[] = startsCategory ? [headerItem] : [];
            let chunkHeight = currentHeaderItemHeight;

            while (remainingItems.length > 0) {
                const nextItem = remainingItems[0];
                const nextItemHeight = currentCalculator(nextItem);
                const hasContentItem = chunkItems.length > (startsCategory ? 1 : 0);

                if (chunkHeight + nextItemHeight > availableHeight && hasContentItem) break;

                chunkItems.push(nextItem);
                chunkHeight += nextItemHeight;
                remainingItems.shift();

                if (chunkHeight > availableHeight) break;
            }

            pushLockedChunk(currentPlacement, category, startsCategory, chunkItems, chunkHeight, flowOffsetBefore);
            startsCategory = false;

            if (remainingItems.length > 0) {
                currentPlacement = advancePlacement(currentPlacement);
            }
        }
        fallbackPlacement = currentPlacement;
    });

    pages.forEach((page) => {
        page.flatItems = buildPageFlatItems(page);
    });

    return pages;
};

/** Keep explicit pages and pages carrying user assets even after the content reflows. */
export function finalizeMenuPages(basePages: PageLayout[], style: MenuStyle, products: Product[] = []) {
    const columnCount = style.categoryColumnCount || 1;
    const emptyPage = (): PageLayout => ({
        mainHeader: null, columnCount, flatItems: [],
        columns: Array.from({ length: columnCount }, (_, columnIndex) => ({
            columnIndex, chunks: [], estimatedHeight: 0,
        })),
    });
    const pages = [...basePages];
    const pageHasItems = (page: PageLayout) => page.columns.some(column => column.chunks.length);
    const hasPageCopies = style.blankPages?.some(page => page.copiedLayout);
    const hidden = hasPageCopies ? new Set(style.hiddenProductIds) : undefined;
    const productsById = new Map(hasPageCopies
        ? products.filter(product => !hidden?.has(product.id)).map(product => [product.id, product])
        : []);
    for (const blankPage of [...(style.blankPages || [])].sort((a, b) => a.index - b.index)) {
        const hasImage = style.addedImages?.some((image) => (image.pageIndex || 0) === blankPage.index);
        const existing = pages[blankPage.index];
        if (blankPage.copiedLayout) {
            const layout = blankPage.copiedLayout;
            const columns = layout.columns.map((column, columnIndex) => {
                const chunks = column.flatMap((chunk, chunkIndex): CategoryChunkLayout[] => {
                    const retained = chunk.items.flatMap(item => item.type === 'category-header' ? []
                        : item.ids.map(id => productsById.get(id)).filter((product): product is Product => Boolean(product)));
                    if (!retained.length) return [];
                    const category = retained[0].category;
                    const items = chunk.items.flatMap((item): PageItem[] => {
                        if (item.type === 'category-header') return [{ type: item.type, data: category, category }];
                        const data = item.ids.map(id => productsById.get(id)).filter((product): product is Product => Boolean(product));
                        if (!data.length) return [];
                        return [item.type === 'product-item' ? { type: item.type, data: data[0], category }
                            : { type: item.type, data, category }];
                    });
                    return [{ ...chunk, category, chunkId: `${blankPage.id}-${columnIndex}-${chunkIndex}`, columnIndex, items }];
                });
                return { columnIndex, chunks, estimatedHeight: chunks.reduce((sum, chunk) => sum + chunk.estimatedHeight, 0) };
            });
            const copy: PageLayout = {
                mainHeader: getPageHeader(style, blankPage.index, layout.showHeader),
                headerCopy: layout.showHeader,
                columns,
                columnCount: columns.length,
                blankPageId: blankPage.id,
                flatItems: [],
            };
            copy.flatItems = buildPageFlatItems(copy);
            while (pages.length < blankPage.index) pages.push(emptyPage());
            const replace = existing && !existing.blankPageId && !pageHasItems(existing) ? 1 : 0;
            pages.splice(blankPage.index, replace, copy);
            continue;
        }
        if (existing) {
            const belongsToBlankPage = (chunk: CategoryChunkLayout) => (chunk.category.startsWith(FREE_TEXT_PREFIX) || style.categoryPositions?.[chunk.category]?.pageX !== undefined)
                && style.categoryPositions?.[chunk.category]?.pageIndex === blankPage.index;
            const remaining = existing.columns.map(column => ({ ...column, chunks: column.chunks.filter(chunk => !belongsToBlankPage(chunk)) }));
            if (remaining.every(column => !column.chunks.length) && (blankPage.fixedPosition || blankPage.index > 0 || !existing.mainHeader)) {
                pages[blankPage.index] = { ...existing, blankPageId: blankPage.id };
                continue;
            }
            if (!hasImage) continue;
            const originalPage = { ...existing, columns: remaining };
            const columns = existing.columns.map(column => ({ ...column, chunks: column.chunks.filter(belongsToBlankPage), estimatedHeight: 0 }));
            const pageWithText = { ...emptyPage(), columns, blankPageId: blankPage.id };
            pages[blankPage.index] = { ...originalPage, flatItems: buildPageFlatItems(originalPage) };
            pages.splice(blankPage.index, 0, { ...pageWithText, flatItems: buildPageFlatItems(pageWithText) });
            continue;
        }
        pages.splice(Math.max(0, Math.min(blankPage.index, pages.length)), 0, { ...emptyPage(), blankPageId: blankPage.id });
    }
    const assets = [...(style.pageBackgrounds || []), ...(style.addedImages || []), ...(style.floatingText || [])];
    const lastHeadingPage = Math.max(-1, ...Object.values(style.headingPages || {}).flatMap(visibility =>
        Array.isArray(visibility) ? visibility.filter(index => Number.isSafeInteger(index) && index >= 0) : []));
    const minimumPageCount = assets.reduce((count, asset) =>
        Number.isSafeInteger(asset.pageIndex) && asset.pageIndex >= 0 ? Math.max(count, asset.pageIndex + 1) : count, Math.max(1, lastHeadingPage + 1));
    while (pages.length < minimumPageCount) pages.push(emptyPage());
    return pages.map((page, index) => {
        const mainHeader = getPageHeader(style, index, page.headerCopy === true);
        if (page.mainHeader?.type === 'main-header' && mainHeader
            && page.mainHeader.title === mainHeader.title && page.mainHeader.subtitle === mainHeader.subtitle
            || !page.mainHeader && !mainHeader) return page;
        const next = { ...page, mainHeader };
        return { ...next, flatItems: buildPageFlatItems(next) };
    });
}

export const calculatePagination = (
    products: Product[],
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    sortedCategories: string[],
    categoryPlacementAssignments?: Record<string, CategoryPlacementAssignment> | null,
    options: PaginationOptions = {}
): PageLayout[] => {
    const priceDecimalPlaces = resolveMenuPriceDecimalPlaces(style, products);
    if (style.priceDecimalPlaces !== priceDecimalPlaces) style = { ...style, priceDecimalPlaces };

    const categoryColumnCount = style.categoryColumnCount || 1;
    const baseColumnHeight = getPaginationContentHeight(style);
    const headerHeight = (page: PageLayout) => getMainHeaderHeight(style, page.mainHeader, options.measuredHeights);
    const emptyColumnHeight = getEmptyColumnHeight(style, baseColumnHeight, options);
    const pageBreaks = new Set(style.pageBreaks || []);
    const hidden = new Set(style.hiddenProductIds);
    for (const page of style.blankPages || []) {
        page.copiedLayout?.columns.forEach(column => column.forEach(chunk => chunk.items.forEach(item => {
            if (item.type !== 'category-header') item.ids.forEach(id => hidden.add(id));
        })));
    }
    const isHidden = (id: string) => hidden.has(id) || Boolean(style.freeTextBackgrounds?.[id]);

    if (categoryPlacementAssignments) {
        return buildLockedPagination(
            style,
            groupedProducts,
            sortedCategories,
            categoryPlacementAssignments,
            isHidden,
            options
        );
    }

    const getNextChunkId = createCategoryChunkIdFactory();

    const createPage = (mainHeader: PageItem | null, pageColumnCount: number = categoryColumnCount): MutablePage => ({
        mainHeader,
        columns: Array.from({ length: pageColumnCount }, (_, columnIndex) => ({
            columnIndex,
            chunks: [],
            estimatedHeight: 0,
        })),
        flatItems: [],
        columnCount: pageColumnCount,
        _columnHeights: Array.from({ length: pageColumnCount }, () => 0),
    });

    const finalizePage = (page: MutablePage): PageLayout => {
        const finalizedPage: PageLayout = {
            mainHeader: page.mainHeader,
            columns: page.columns.map((column) => ({
                columnIndex: column.columnIndex,
                chunks: [...column.chunks],
                estimatedHeight: column.estimatedHeight,
            })),
            flatItems: [],
            columnCount: page.columnCount || page.columns.length,
        };

        finalizedPage.flatItems = buildPageFlatItems(finalizedPage);
        return balanceColumns(finalizedPage);
    };

    const balanceColumns = (page: PageLayout): PageLayout => {
        if (!style.design || page.columns.length < 2 || style.categoryColumnWidths?.length && !style.productPhotoRatio
            || Object.keys(style.categoryPositions || {}).length) return page;
        const chunks = page.columns.flatMap((column) => column.chunks);
        const lanes = Math.min(chunks.length, page.columns.length);
        if (lanes < 2) return page;
        const columns = page.columns.map((column) => ({ ...column, chunks: [] as CategoryChunkLayout[], estimatedHeight: 0 }));
        let index = 0;
        let remainingHeight = chunks.reduce((sum, chunk) => sum + chunk.estimatedHeight + CATEGORY_CHUNK_GAP_PX, 0);
        let targetHeight = remainingHeight / lanes;
        chunks.forEach((chunk, position) => {
            const current = columns[index];
            const heightAt = (lane: number) => style.categoryColumnWidths?.length
                ? chunk.items.reduce((height, item) => height + calculators[lane](item), 0) : chunk.estimatedHeight;
            const overflow = current.estimatedHeight + heightAt(index) + CATEGORY_CHUNK_GAP_PX > targetHeight;
            if (current.chunks.length && index + 1 < lanes && (overflow || chunks.length - position === lanes - index - 1)) {
                index++;
                targetHeight = remainingHeight / (lanes - index);
            }
            const column = columns[index];
            const estimatedHeight = heightAt(index);
            column.estimatedHeight += estimatedHeight + (column.chunks.length ? CATEGORY_CHUNK_GAP_PX : 0);
            column.chunks.push({ ...chunk, columnIndex: index, estimatedHeight });
            remainingHeight -= chunk.estimatedHeight + CATEGORY_CHUNK_GAP_PX;
        });
        const limit = baseColumnHeight - headerHeight(page);
        if (columns.some((column) => column.estimatedHeight > limit)) return page;
        const balanced = { ...page, columns };
        return { ...balanced, flatItems: buildPageFlatItems(balanced) };
    };

    const pages: PageLayout[] = [];
    let currentPage = createPage(getPageHeader(style, 0));
    let currentColumnIndex = 0;
    const calculators = Array.from({ length: categoryColumnCount }, (_, columnIndex) => (
        createPageItemHeightCalculator(style, categoryColumnCount, columnIndex, options.measuredHeights)
    ));
    const getItemHeight = (item: PageItem) => calculators[currentColumnIndex](item);

    const getColumnLimit = (page: MutablePage) => baseColumnHeight - headerHeight(page);
    const getCurrentColumnHeight = () => currentPage._columnHeights[currentColumnIndex];
    const getRemainingHeight = (index = currentColumnIndex) => {
        const column = currentPage.columns[index];
        const nextChunkGap = column.chunks.length > 0 ? CATEGORY_CHUNK_GAP_PX : 0;
        return getColumnLimit(currentPage) - currentPage._columnHeights[index] - nextChunkGap;
    };
    const pageHasAnyContent = (page: MutablePage) =>
        Boolean(page.mainHeader) || page.columns.some((column) => column.chunks.length > 0);
    const startNextPage = () => {
        pages.push(finalizePage(currentPage));
        currentPage = createPage(getPageHeader(style, pages.length), categoryColumnCount);
        currentColumnIndex = 0;
    };

    const moveToNextColumnOrPage = () => {
        if (currentColumnIndex < currentPage.columns.length - 1) {
            currentColumnIndex += 1;
            return;
        }

        startNextPage();
    };

    const pushChunk = (category: string, startsCategory: boolean, items: PageItem[], estimatedHeight: number) => {
        const chunk: CategoryChunkLayout = {
            chunkId: getNextChunkId(category),
            category,
            startsCategory,
            columnIndex: currentColumnIndex,
            items,
            estimatedHeight,
        };

        const column = currentPage.columns[currentColumnIndex];
        const gapBeforeChunk = column.chunks.length > 0 ? CATEGORY_CHUNK_GAP_PX : 0;
        column.chunks.push(chunk);
        column.estimatedHeight += estimatedHeight + gapBeforeChunk;
        currentPage._columnHeights[currentColumnIndex] += estimatedHeight + gapBeforeChunk;
    };

    const placeLooseItems = (category: string, items: PageItem[]) => {
        let remainingItems = [...items];

        while (remainingItems.length > 0) {
            const nextItemHeight = getItemHeight(remainingItems[0]);
            if (currentPage.mainHeader && nextItemHeight > getColumnLimit(currentPage) && nextItemHeight <= emptyColumnHeight) {
                startNextPage();
            }

            if (getRemainingHeight() <= 0 && getCurrentColumnHeight() > 0) {
                moveToNextColumnOrPage();
            }

            const columnWasEmpty = getCurrentColumnHeight() === 0;
            const availableHeight = getRemainingHeight();
            const chunkItems: PageItem[] = [];
            let chunkHeight = 0;

            while (remainingItems.length > 0) {
                const nextItem = remainingItems[0];
                const nextItemHeight = getItemHeight(nextItem);
                const fits = chunkHeight + nextItemHeight <= availableHeight;

                if (!fits && chunkItems.length > 0) break;
                if (!fits && !columnWasEmpty) break;

                chunkItems.push(nextItem);
                chunkHeight += nextItemHeight;
                remainingItems.shift();

                if (!fits) break;
            }

            if (chunkItems.length === 0) {
                moveToNextColumnOrPage();
                continue;
            }

            pushChunk(category, false, chunkItems, chunkHeight);

            if (remainingItems.length > 0) {
                moveToNextColumnOrPage();
            }
        }
    };

    const placeCategory = (category: string, items: PageItem[]) => {
        if (items.length === 0) return;

        if (pageBreaks.has(category) && (pages.length === 0 && currentPage.mainHeader || currentPage.columns.some(column => column.chunks.length))) {
            startNextPage();
        }

        const headerItem: PageItem = { type: 'category-header', data: category, category };
        const fullHeights = calculators.map((calculateHeight) => (
            calculateHeight(headerItem) + items.reduce((sum, item) => sum + calculateHeight(item), 0)
        ));
        const keepTogether = !(style.splitCategoryAcrossPages ?? options.splitCategoryAcrossPages) && fullHeights.some((height) => height <= emptyColumnHeight);
        let remainingItems = [...items];
        let startsCategory = true;

        while (remainingItems.length > 0) {
            const requiredHeight = (index: number) => {
                const calculateHeight = calculators[index];
                const firstItemHeight = calculateHeight(remainingItems[0]);
                if (!startsCategory) return firstItemHeight;
                return keepTogether ? fullHeights[index] : calculateHeight(headerItem) + firstItemHeight;
            };
            const fittingColumn = findCategoryColumn(currentPage.columns, currentColumnIndex, emptyColumnHeight, requiredHeight, getRemainingHeight);
            if (fittingColumn === undefined) {
                startNextPage();
                continue;
            }
            currentColumnIndex = fittingColumn;

            const availableHeight = getRemainingHeight() + FIT_TOLERANCE_PX;
            const chunkItems: PageItem[] = startsCategory ? [headerItem] : [];
            let chunkHeight = startsCategory ? getItemHeight(headerItem) : 0;

            while (remainingItems.length > 0) {
                const nextItem = remainingItems[0];
                const nextItemHeight = getItemHeight(nextItem);
                const fits = chunkHeight + nextItemHeight <= availableHeight;

                if (!fits && chunkItems.length > (startsCategory ? 1 : 0)) break;

                chunkItems.push(nextItem);
                chunkHeight += nextItemHeight;
                remainingItems.shift();

                if (!fits) break;
            }

            pushChunk(category, startsCategory, chunkItems, chunkHeight);
            startsCategory = false;
        }
    };

    sortedCategories.forEach((category) => {
        const categoryProducts = groupedProducts[category];
        if (!categoryProducts || categoryProducts.length === 0) return;

        const visibleProducts = categoryProducts.filter((product) => !isHidden(product.id));
        if (visibleProducts.length === 0) return;

        if (category.startsWith(FREE_TEXT_PREFIX)) {
            const items: PageItem[] = visibleProducts.map((product) => ({
                type: 'product-item',
                data: product,
                category,
            }));
            placeLooseItems(category, items);
            return;
        }

        const isRowLayout = style.layoutMode === 'grid' || style.layoutMode === 'cards' || (style.columnCount || 1) > 1;
        const productColumnCount = style.columnCount || 1;
        const items = buildCategoryProductItems(visibleProducts, category, isRowLayout, productColumnCount);

        placeCategory(category, items);
    });

    if (pageHasAnyContent(currentPage)) {
        pages.push(finalizePage(currentPage));
    }

    return pages;
};
