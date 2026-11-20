import { categoryName } from './categoryName';
import type { Product, MenuStyle } from './model';
import { resolveMenuMargins, resolveMinimumFontSize, resolveMenuContentSpacing, clampFontSize, resolveProductImageFrame } from './styleRules';
import { resolveMenuPageDimensions } from './pageSetup';
import { normalizeColumnWidths } from './categoryColumns';
import { templateHeaderExtra, templateCategoryExtra } from '../templates/templateDesign';
import { FREE_TEXT_PREFIX, CATEGORY_CHUNK_GAP_PX } from './flow';
import { formatMenuPrice } from './price';

const PRODUCT_GRID_GAP_PX = 24;

const PRODUCT_ITEM_HORIZONTAL_PADDING_PX = 16;

const PRODUCT_ITEM_VERTICAL_PADDING_PX = 0;

const FREE_TEXT_VERTICAL_PADDING_PX = 16;

const PRODUCT_CARD_VERTICAL_PADDING_PX = 24;

const PRODUCT_CARD_IMAGE_HEIGHT_PX = 168;

export type PageItem =
    | { type: 'main-header' }
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

export const getProductCardImageLimit = (style: MenuStyle) => {
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = style.categoryColumnCount || 1;
    if (categoryColumnCount > 1 || productColumnCount >= 3) return 96;
    if (productColumnCount === 2) return 120;
    return PRODUCT_CARD_IMAGE_HEIGHT_PX;
};

export const getProductListImageLimit = (categoryColumnCount: number) => categoryColumnCount === 2 ? 88 : 112;
export const CATEGORY_IMAGE_LIMIT = 64;

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

const getMainHeaderHeight = (style: MenuStyle, measuredHeights?: PaginationOptions['measuredHeights']) => {
    const measured = measuredHeights?.get('main-header');
    if (measured !== undefined) return measured;
    const spacing = resolveMenuContentSpacing(style);
    const titleSize = clampFontSize(style, 'menuTitle', style.elementStyles?.menuTitle?.fontSize, 48);
    const hasSubtitle = Boolean(style.menuSubtitle?.trim());
    const titleBottom = hasSubtitle
        ? (style.elementStyles?.menuTitle?.marginBottom ?? 10)
        : spacing.headerToContent;
    if (!hasSubtitle) return (titleSize * 1.22) + titleBottom + templateHeaderExtra(style);

    const subtitleSize = clampFontSize(style, 'menuSubtitle', style.elementStyles?.menuSubtitle?.fontSize, 18);
    return (titleSize * 1.22) + titleBottom + (subtitleSize * 1.35) + spacing.headerToContent + templateHeaderExtra(style);
};

const getPaginationContentHeight = (style: MenuStyle) => Math.max(
    1,
    resolveMenuPageDimensions(style).heightPx - resolveMenuMargins(style).top - getPaginationBottomInset(style),
);

export function getPaginationColumnLimit(style: MenuStyle, page: PageLayout, options: PaginationOptions) {
    return getPaginationContentHeight(style) - (page.mainHeader ? getMainHeaderHeight(style, options.measuredHeights) : 0);
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
    let contentHeight = 0;

    if (isRowLayout) {
        const productGridGap = getProductGridGap(style);
        const usableColWidth = Math.max(40, (containerWidth - (productGridGap * (columnCount - 1))) / columnCount);
        if (style.showImages && product.image) {
            const frame = resolveProductImageFrame(style, true);
            const height = Math.min(usableColWidth, getProductCardImageLimit(style) * imgScale);
            contentHeight += frame === 'template' && style.design?.image === 'background' ? 36 * imgScale : height;
        }
        const cardHorizontalPadding = categoryColumnCount > 1 || columnCount > 2 ? 12 : columnCount > 1 ? 16 : 32;
        const textContentWidth = Math.max(32, usableColWidth - cardHorizontalPadding);
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
        contentHeight += cardVerticalPadding + 28;
    } else {
        const hasImage = Boolean(style.showImages && product.image);
        const imgHeight = hasImage
            ? Math.min(getProductListImageLimit(categoryColumnCount) * imgScale, containerWidth * (categoryColumnCount >= 3 ? 1 : .42))
            : 0;
        const compactLayout = categoryColumnCount > 1;
        const innerWidth = Math.max(80, containerWidth);
        const imageGap = compactLayout ? 8 : 16;
        const textWidth = hasImage && categoryColumnCount < 3
            ? Math.max(80, innerWidth - imgHeight - imageGap)
            : innerWidth;

        let textHeight = 0;

        const nameCharWidth = fontSize * 0.6;
        const showPrice = style.showPrices !== false;
        const formattedPriceLength = formatMenuPrice(product.price, style).length;
        const priceColumnReserve = showPrice
            ? Math.max(36, formattedPriceLength * priceSize * 0.58) + spacing.productNameToPrice
            : 0;
        const editButtonReserve = compactLayout ? 0 : 48;
        const longestNameWordWidth = Math.max(
            0,
            ...product.name.split(/\s+/).filter(Boolean).map((word) => word.length * nameCharWidth),
        );
        const wrapsPrice = showPrice && longestNameWordWidth + priceColumnReserve + editButtonReserve > textWidth;
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

        contentHeight = categoryColumnCount >= 3 && hasImage
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
    const categoryStyle = style.elementStyles?.category || {};
    const categoryFontSize = clampFontSize(style, 'category', categoryStyle.fontSize, 24);
    const spacing = resolveMenuContentSpacing(style);
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = categoryColumnCountOverride || style.categoryColumnCount || 1;
    const categoryColumnWidth = getCategoryColumnWidth(style, categoryColumnCount, categoryColumnIndex);

    return (item: PageItem) => {
        const measured = measuredHeights?.get(getPaginationHeightKey(getPaginationItemKey(item), categoryColumnWidth));
        if (measured !== undefined) return measured;
        if (item.type === 'category-header') {
            const editButtonReserve = categoryColumnCount > 1 ? 32 : 52;
            const dividerReserve = categoryStyle.textAlign === 'center' ? 64 : 32;
            const categoryImage = style.showCategoryImages !== false ? style.categoryImages?.[item.data] : undefined;
            const categoryImageScale = style.categoryImageScale || 1;
            const aspect = Math.min(3, Math.max(.375, (categoryImage?.width || 1) / (categoryImage?.height || 1)));
            const imageWidth = categoryImage?.url ? Math.min(categoryColumnWidth * .35, CATEGORY_IMAGE_LIMIT * categoryImageScale * Math.min(aspect, 1)) : 0;
            const imageReserve = imageWidth ? imageWidth + 8 : 0;
            const letterSpacing = categoryStyle.letterSpacing || 0;
            const categoryCharWidth = (categoryFontSize * 0.6) + letterSpacing;
            const lines = getSafeLineCount(
                categoryName(item.data),
                Math.max(24, categoryColumnWidth - editButtonReserve - dividerReserve - imageReserve),
                categoryCharWidth
            );
            const imageHeight = imageWidth / aspect;
            return Math.max(categoryFontSize * 1.25 * lines, imageHeight, 28) + spacing.categoryToProduct + 8 + templateCategoryExtra(style);
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

const createLockedPage = (categoryColumnCount: number, includeMainHeader: boolean): PageLayout => ({
    mainHeader: includeMainHeader ? { type: 'main-header' } : null,
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
    const headerHeight = getMainHeaderHeight(style, options.measuredHeights);
    const normalizePlacement = (placement?: CategoryPlacementAssignment | null): CategoryPlacementAssignment => {
        const pageIndex = Number(placement?.pageIndex);
        const columnIndex = Number(placement?.columnIndex);

        return {
            pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
            columnIndex: Number.isFinite(columnIndex) ? Math.max(0, Math.min(categoryColumnCount - 1, Math.floor(columnIndex))) : 0,
        };
    };
    const getLockedPageColumnCount = (_pageIndex: number) => categoryColumnCount;
    const pages: PageLayout[] = [createLockedPage(getLockedPageColumnCount(0), true)];
    const getNextChunkId = createCategoryChunkIdFactory();
    let fallbackPlacement: CategoryPlacementAssignment = { pageIndex: 0, columnIndex: 0 };

    const hasChunks = (column: PageColumnLayout) => column.estimatedHeight > 0;

    const ensurePage = (pageIndex: number) => {
        const safePageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0;
        while (pages.length <= safePageIndex) {
            pages.push(createLockedPage(getLockedPageColumnCount(pages.length), false));
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

        const contentStartY = margins.top + (page.mainHeader ? headerHeight : 0);
        const requestedOffset = Math.max(0, requestedPosition.y - contentStartY);
        const normalGap = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;
        const naturalOffset = column.estimatedHeight + normalGap;
        const remainingHeight = baseColumnHeight - (page.mainHeader ? headerHeight : 0) - naturalOffset;
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
        const columnLimit = baseColumnHeight - (page.mainHeader ? headerHeight : 0);
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
        const keepTogether = !options.splitCategoryAcrossPages && fullHeights.some((height) => height <= baseColumnHeight);
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
            const fittingColumn = findCategoryColumn(page.columns, currentPlacement.columnIndex, baseColumnHeight, requiredHeight,
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
export function finalizeMenuPages(basePages: PageLayout[], style: MenuStyle) {
    const columnCount = style.categoryColumnCount || 1;
    const emptyPage = (): PageLayout => ({
        mainHeader: null, columnCount, flatItems: [],
        columns: Array.from({ length: columnCount }, (_, columnIndex) => ({
            columnIndex, chunks: [], estimatedHeight: 0,
        })),
    });
    const pages = [...basePages];
    for (const blankPage of [...(style.blankPages || [])].sort((a, b) => a.index - b.index)) {
        const hasImage = style.addedImages?.some((image) => (image.pageIndex || 0) === blankPage.index);
        const existing = pages[blankPage.index];
        if (existing) {
            const belongsToBlankPage = (chunk: CategoryChunkLayout) => (chunk.category.startsWith(FREE_TEXT_PREFIX) || style.categoryPositions?.[chunk.category]?.pageX !== undefined)
                && style.categoryPositions?.[chunk.category]?.pageIndex === blankPage.index;
            const remaining = existing.columns.map(column => ({ ...column, chunks: column.chunks.filter(chunk => !belongsToBlankPage(chunk)) }));
            if (!existing.mainHeader && remaining.every(column => !column.chunks.length)) {
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
    const minimumPageCount = assets.reduce((count, asset) =>
        Number.isSafeInteger(asset.pageIndex) && asset.pageIndex >= 0 ? Math.max(count, asset.pageIndex + 1) : count, 1);
    while (pages.length < minimumPageCount) pages.push(emptyPage());
    return pages;
}

export const calculatePagination = (
    products: Product[],
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    sortedCategories: string[],
    categoryPlacementAssignments?: Record<string, CategoryPlacementAssignment> | null,
    options: PaginationOptions = {}
): PageLayout[] => {
    const categoryColumnCount = style.categoryColumnCount || 1;
    const baseColumnHeight = getPaginationContentHeight(style);
    const headerHeight = getMainHeaderHeight(style, options.measuredHeights);
    const pageBreaks = new Set(style.pageBreaks || []);
    const isHidden = (id: string) => style.hiddenProductIds?.includes(id) || Boolean(style.freeTextBackgrounds?.[id]);

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

    const createPage = (includeMainHeader: boolean, pageColumnCount: number = categoryColumnCount): MutablePage => ({
        mainHeader: includeMainHeader ? { type: 'main-header' } : null,
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
        if (!style.design || page.columns.length < 2 || style.categoryColumnWidths?.length
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
            const overflow = current.estimatedHeight + chunk.estimatedHeight + CATEGORY_CHUNK_GAP_PX > targetHeight;
            if (current.chunks.length && index + 1 < lanes && (overflow || chunks.length - position === lanes - index - 1)) {
                index++;
                targetHeight = remainingHeight / (lanes - index);
            }
            const column = columns[index];
            column.estimatedHeight += chunk.estimatedHeight + (column.chunks.length ? CATEGORY_CHUNK_GAP_PX : 0);
            column.chunks.push({ ...chunk, columnIndex: index });
            remainingHeight -= chunk.estimatedHeight + CATEGORY_CHUNK_GAP_PX;
        });
        const limit = baseColumnHeight - (page.mainHeader ? headerHeight : 0);
        if (columns.some((column) => column.estimatedHeight > limit)) return page;
        const balanced = { ...page, columns };
        return { ...balanced, flatItems: buildPageFlatItems(balanced) };
    };

    const pages: PageLayout[] = [];
    let currentPage = createPage(true);
    let currentColumnIndex = 0;
    const calculators = Array.from({ length: categoryColumnCount }, (_, columnIndex) => (
        createPageItemHeightCalculator(style, categoryColumnCount, columnIndex, options.measuredHeights)
    ));
    const getItemHeight = (item: PageItem) => calculators[currentColumnIndex](item);

    const getColumnLimit = (page: MutablePage) => baseColumnHeight - (page.mainHeader ? headerHeight : 0);
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
        currentPage = createPage(false, categoryColumnCount);
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
            if (currentPage.mainHeader && nextItemHeight > getColumnLimit(currentPage) && nextItemHeight <= baseColumnHeight) {
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

        if (pageBreaks.has(category) && pageHasAnyContent(currentPage)) {
            startNextPage();
        }

        const headerItem: PageItem = { type: 'category-header', data: category, category };
        const fullHeights = calculators.map((calculateHeight) => (
            calculateHeight(headerItem) + items.reduce((sum, item) => sum + calculateHeight(item), 0)
        ));
        const keepTogether = !options.splitCategoryAcrossPages && fullHeights.some((height) => height <= baseColumnHeight);
        let remainingItems = [...items];
        let startsCategory = true;

        while (remainingItems.length > 0) {
            const requiredHeight = (index: number) => {
                const calculateHeight = calculators[index];
                const firstItemHeight = calculateHeight(remainingItems[0]);
                if (!startsCategory) return firstItemHeight;
                return keepTogether ? fullHeights[index] : calculateHeight(headerItem) + firstItemHeight;
            };
            const fittingColumn = findCategoryColumn(currentPage.columns, currentColumnIndex, baseColumnHeight, requiredHeight, getRemainingHeight);
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
