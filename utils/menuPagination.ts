import { Product, MenuStyle } from '../types';
import { clampFontSize, resolveMenuContentSpacing, resolveMenuMargins } from './styleRules';
import { normalizeColumnWidths } from './categoryColumns';

export const A4_HEIGHT_PX = 1123;
export const A4_WIDTH_PX = 794;
export const SAFETY_BUFFER = 20;
export const STANDARD_GAP = 15;
export const FREE_TEXT_PREFIX = 'ft_zone_';

const DENSE_COLUMNS_SAFETY_BUFFER_PX = 16;
const CATEGORY_CHUNK_GAP_PX = 16;
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
}

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

const getProductCardImageHeight = (style: MenuStyle) => {
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = style.categoryColumnCount || 1;
    const imgScale = style.imageScale || 1;

    if (categoryColumnCount >= 3) return 56 * imgScale;
    if (categoryColumnCount === 2) return 72 * imgScale;
    if (productColumnCount >= 3) return 90 * imgScale;
    if (productColumnCount === 2) return 120 * imgScale;
    return PRODUCT_CARD_IMAGE_HEIGHT_PX * imgScale;
};

const getPaginationSafetyBuffer = (style: MenuStyle) => {
    const baseline = (style.columnCount || 1) > 2 || (style.categoryColumnCount || 1) > 2
        ? DENSE_COLUMNS_SAFETY_BUFFER_PX
        : SAFETY_BUFFER;
    const pageNumberSize = Math.min(50, Math.max(1, Number(style.elementStyles?.pageNumber?.fontSize) || 14));
    const pageNumberReserve = Math.max(
        0,
        (pageNumberSize * 1.2) + 8 - resolveMenuMargins(style).bottom
    );
    return Math.max(baseline, pageNumberReserve);
};

const getCategoryColumnWidth = (
    style: MenuStyle,
    categoryColumnCountOverride?: number,
    columnIndex?: number,
): number => {
    const margins = resolveMenuMargins(style);
    const usableWidth = A4_WIDTH_PX - margins.left - margins.right;
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

const getMainHeaderHeight = (style: MenuStyle) => {
    const spacing = resolveMenuContentSpacing(style);
    const titleSize = clampFontSize(style, 'menuTitle', style.elementStyles?.menuTitle?.fontSize, 48);
    const hasSubtitle = Boolean(style.menuSubtitle?.trim());
    const titleBottom = hasSubtitle
        ? (style.elementStyles?.menuTitle?.marginBottom ?? 10)
        : spacing.headerToContent;
    if (!hasSubtitle) return (titleSize * 1.22) + titleBottom;

    const subtitleSize = clampFontSize(style, 'menuSubtitle', style.elementStyles?.menuSubtitle?.fontSize, 18);
    return (titleSize * 1.22) + titleBottom + (subtitleSize * 1.35) + spacing.headerToContent;
};

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
        if (style.showImages && product.image) {
            contentHeight += getProductCardImageHeight(style);
        }

        const productGridGap = getProductGridGap(style);
        const usableColWidth = Math.max(40, (containerWidth - (productGridGap * (columnCount - 1))) / columnCount);
        const cardHorizontalPadding = categoryColumnCount > 1 || columnCount > 2 ? 12 : columnCount > 1 ? 16 : 32;
        const textContentWidth = Math.max(32, usableColWidth - cardHorizontalPadding);
        const nameCharWidth = fontSize * 0.6;
        const editButtonReserve = categoryColumnCount > 1 || columnCount > 1 ? 24 : 40;
        const nameLines = getSafeLineCount(product.name, Math.max(24, textContentWidth - editButtonReserve), nameCharWidth);
        contentHeight += (fontSize * 1.6 * nameLines) + spacing.productNameToDescription;

        contentHeight += (priceSize * 1.6) + 6;

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
            ? (categoryColumnCount >= 3 ? 96 * imgScale : categoryColumnCount === 2 ? 64 * imgScale : 96 * imgScale)
            : 0;
        const compactLayout = categoryColumnCount > 1;
        const innerWidth = Math.max(80, containerWidth);
        const imageGap = compactLayout ? 8 : 16;
        const textWidth = hasImage && categoryColumnCount < 3
            ? Math.max(80, innerWidth - imgHeight - imageGap)
            : innerWidth;

        let textHeight = 0;

        const nameCharWidth = fontSize * 0.6;
        const formattedPriceLength = product.price.toFixed(2).length + 2;
        const priceColumnReserve = Math.max(36, formattedPriceLength * priceSize * 0.58) + spacing.productNameToPrice;
        const editButtonReserve = compactLayout ? 0 : 48;
        const nameLines = getSafeLineCount(
            product.name,
            Math.max(48, textWidth - priceColumnReserve - editButtonReserve),
            nameCharWidth,
        );
        const nameAndPriceHeight = Math.max(fontSize * 1.375 * nameLines, priceSize * 1.375);
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
    if (!isRowLayout) {
        return visibleProducts.map((product) => ({
            type: 'product-item' as const,
            data: product,
            category,
        }));
    }

    const items: PageItem[] = [];
    let currentRow: Product[] = [];
    const flushRow = () => {
        if (currentRow.length === 0) return;
        items.push({
            type: 'product-row',
            data: currentRow,
            category,
        });
        currentRow = [];
    };

    visibleProducts.forEach((product) => {
        if (product.isFreeText) {
            flushRow();
            items.push({
                type: 'product-item',
                data: product,
                category,
            });
            return;
        }

        currentRow.push(product);
        if (currentRow.length >= productColumnCount) flushRow();
    });

    flushRow();
    return items;
};

const createPageItemHeightCalculator = (
    style: MenuStyle,
    categoryColumnCountOverride?: number,
    categoryColumnIndex?: number,
) => {
    const categoryStyle = style.elementStyles?.category || {};
    const categoryFontSize = clampFontSize(style, 'category', categoryStyle.fontSize, 24);
    const spacing = resolveMenuContentSpacing(style);
    const productColumnCount = style.columnCount || 1;
    const categoryColumnCount = categoryColumnCountOverride || style.categoryColumnCount || 1;
    const categoryColumnWidth = getCategoryColumnWidth(style, categoryColumnCount, categoryColumnIndex);

    return (item: PageItem) => {
        if (item.type === 'category-header') {
            const editButtonReserve = categoryColumnCount > 1 ? 32 : 52;
            const dividerReserve = categoryStyle.textAlign === 'center' ? 64 : 32;
            const letterSpacing = categoryStyle.letterSpacing || 0;
            const categoryCharWidth = (categoryFontSize * 0.6) + letterSpacing;
            const lines = getSafeLineCount(
                item.data,
                Math.max(24, categoryColumnWidth - editButtonReserve - dividerReserve),
                categoryCharWidth
            );
            return Math.max(categoryFontSize * 1.25 * lines, 28) + spacing.categoryToProduct + 8;
        }
        if (item.type === 'product-item') return calculateItemHeight(item.data, style, false, 1, categoryColumnWidth, categoryColumnCount);
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

const buildLockedPagination = (
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    sortedCategories: string[],
    categoryPlacementAssignments: Record<string, CategoryPlacementAssignment>,
    isHidden: (id: string) => boolean,
    getItemHeight: (item: PageItem) => number,
    options: PaginationOptions
): PageLayout[] => {
    const categoryColumnCount = style.categoryColumnCount || 1;
    const margins = resolveMenuMargins(style);
    const baseColumnHeight = A4_HEIGHT_PX - margins.top - margins.bottom - getPaginationSafetyBuffer(style);
    const headerHeight = getMainHeaderHeight(style);
    const normalizePlacement = (placement?: CategoryPlacementAssignment | null): CategoryPlacementAssignment => {
        const pageIndex = Number(placement?.pageIndex);
        const columnIndex = Number(placement?.columnIndex);

        return {
            pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
            columnIndex: Number.isFinite(columnIndex) ? Math.max(0, Math.floor(columnIndex)) : 0,
        };
    };
    const getLockedPageColumnCount = (_pageIndex: number) => categoryColumnCount;
    const pages: PageLayout[] = [createLockedPage(getLockedPageColumnCount(0), true)];
    const getNextChunkId = createCategoryChunkIdFactory();
    let fallbackPlacement: CategoryPlacementAssignment = { pageIndex: 0, columnIndex: 0 };

    const hasChunks = (column: PageColumnLayout) => column.chunks.length > 0;

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
        category?: string,
        startsCategory: boolean = false,
    ) => {
        if (!startsCategory || !category) return 0;
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
        return Math.max(0, requestedOffset - naturalOffset);
    };

    const pushLockedChunk = (
        placement: CategoryPlacementAssignment,
        category: string,
        startsCategory: boolean,
        items: PageItem[],
        estimatedHeight: number
    ) => {
        const page = ensurePage(placement.pageIndex);
        const column = page.columns[Math.max(0, Math.min(placement.columnIndex, page.columns.length - 1))];
        const gapBeforeChunk = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;
        const flowOffsetBefore = getFlowOffsetBefore(page, column, placement, category, startsCategory);

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

    const getRemainingHeight = (
        placement: CategoryPlacementAssignment,
        category?: string,
        startsCategory: boolean = false,
    ) => {
        const page = ensurePage(placement.pageIndex);
        const column = page.columns[Math.max(0, Math.min(placement.columnIndex, page.columns.length - 1))];
        const columnLimit = baseColumnHeight - (page.mainHeader ? headerHeight : 0);
        const gapBeforeChunk = hasChunks(column) ? CATEGORY_CHUNK_GAP_PX : 0;
        const flowOffsetBefore = getFlowOffsetBefore(page, column, placement, category, startsCategory);
        return columnLimit - column.estimatedHeight - gapBeforeChunk - flowOffsetBefore;
    };

    sortedCategories.forEach((category) => {
        const categoryProducts = groupedProducts[category];
        if (!categoryProducts || categoryProducts.length === 0) return;

        const visibleProducts = categoryProducts.filter((product) => !isHidden(product.id));
        if (visibleProducts.length === 0) return;

        const freePosition = style.categoryPositions?.[category];
        const placement = normalizePlacement(
            freePosition
                ? { pageIndex: freePosition.pageIndex, columnIndex: freePosition.columnIndex }
                : categoryPlacementAssignments[category] || fallbackPlacement
        );
        fallbackPlacement = placement;

        if (category.startsWith(FREE_TEXT_PREFIX)) {
            let remainingItems: PageItem[] = visibleProducts.map((product) => ({
                type: 'product-item',
                data: product,
                category,
            }));
            let currentPlacement = placement;

            while (remainingItems.length > 0) {
                let availableHeight = getRemainingHeight(currentPlacement);
                const page = ensurePage(currentPlacement.pageIndex);
                const column = page.columns[Math.max(0, Math.min(currentPlacement.columnIndex, page.columns.length - 1))];
                if (availableHeight <= 0 && hasChunks(column)) {
                    currentPlacement = advancePlacement(currentPlacement);
                    continue;
                }

                const chunkItems: PageItem[] = [];
                let chunkHeight = 0;
                while (remainingItems.length > 0) {
                    const itemHeight = getItemHeight(remainingItems[0]);
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
        const lockedPage = ensurePage(placement.pageIndex);
        let lockedCalculator = createPageItemHeightCalculator(style, lockedPage.columns.length, placement.columnIndex);
        let headerItemHeight = lockedCalculator(headerItem);
        let fullCategoryHeight = headerItemHeight
            + contentItems.reduce((total, item) => total + lockedCalculator(item), 0);
        let remainingItems = [...contentItems];
        let currentPlacement = placement;
        let startsCategory = true;

        if (!style.categoryPositions?.[category] && placement.columnIndex > 0) {
            for (let columnIndex = 0; columnIndex < placement.columnIndex; columnIndex += 1) {
                const candidatePlacement = { pageIndex: placement.pageIndex, columnIndex };
                const candidateCalculator = createPageItemHeightCalculator(style, lockedPage.columns.length, columnIndex);
                const candidateHeaderHeight = candidateCalculator(headerItem);
                const candidateFullHeight = candidateHeaderHeight
                    + contentItems.reduce((total, item) => total + candidateCalculator(item), 0);
                const requiredHeight = options.splitCategoryAcrossPages
                    ? candidateHeaderHeight + candidateCalculator(contentItems[0])
                    : candidateFullHeight;
                if (getRemainingHeight(candidatePlacement) < requiredHeight) continue;

                currentPlacement = candidatePlacement;
                lockedCalculator = candidateCalculator;
                headerItemHeight = candidateHeaderHeight;
                fullCategoryHeight = candidateFullHeight;
                break;
            }
        }
        fallbackPlacement = currentPlacement;

        if (!options.splitCategoryAcrossPages) {
            if (
                fullCategoryHeight <= baseColumnHeight
                && getRemainingHeight(currentPlacement, category, true) < fullCategoryHeight
            ) {
                currentPlacement = advancePlacement(currentPlacement);
            }
        }

        while (remainingItems.length > 0) {
            const currentCalculator = createPageItemHeightCalculator(
                style,
                ensurePage(currentPlacement.pageIndex).columns.length,
                currentPlacement.columnIndex,
            );
            let availableHeight = getRemainingHeight(currentPlacement, category, startsCategory);
            const firstItemHeight = currentCalculator(remainingItems[0]);
            const currentHeaderItemHeight = startsCategory ? currentCalculator(headerItem) : 0;

            if (startsCategory && availableHeight < currentHeaderItemHeight + firstItemHeight) {
                const page = ensurePage(currentPlacement.pageIndex);
                const column = page.columns[Math.max(0, Math.min(currentPlacement.columnIndex, page.columns.length - 1))];
                const anchoredOffset = getFlowOffsetBefore(page, column, currentPlacement, category, true);
                if (hasChunks(column) || anchoredOffset > 0 || (page.mainHeader && currentHeaderItemHeight + firstItemHeight <= baseColumnHeight)) {
                    currentPlacement = advancePlacement(currentPlacement);
                    continue;
                }
            } else if (!startsCategory && availableHeight < firstItemHeight) {
                const page = ensurePage(currentPlacement.pageIndex);
                const column = page.columns[Math.max(0, Math.min(currentPlacement.columnIndex, page.columns.length - 1))];
                if (hasChunks(column) || (page.mainHeader && firstItemHeight <= baseColumnHeight)) {
                    currentPlacement = advancePlacement(currentPlacement);
                    continue;
                }
            }

            availableHeight = getRemainingHeight(currentPlacement, category, startsCategory);
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

            pushLockedChunk(currentPlacement, category, startsCategory, chunkItems, chunkHeight);
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

export const calculatePagination = (
    products: Product[],
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    sortedCategories: string[],
    categoryPlacementAssignments?: Record<string, CategoryPlacementAssignment> | null,
    options: PaginationOptions = {}
): PageLayout[] => {
    const categoryColumnCount = style.categoryColumnCount || 1;
    const margins = resolveMenuMargins(style);
    const baseColumnHeight = A4_HEIGHT_PX - margins.top - margins.bottom - getPaginationSafetyBuffer(style);
    const headerHeight = getMainHeaderHeight(style);
    const pageBreaks = new Set(style.pageBreaks || []);
    const isHidden = (id: string) => style.hiddenProductIds?.includes(id);
    const baseGetItemHeight = createPageItemHeightCalculator(style);

    if (categoryPlacementAssignments) {
        return buildLockedPagination(
            style,
            groupedProducts,
            sortedCategories,
            categoryPlacementAssignments,
            isHidden,
            baseGetItemHeight,
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
        return finalizedPage;
    };

    const pages: PageLayout[] = [];
    let currentPage = createPage(true);
    let currentColumnIndex = 0;
    const heightCalculators = new Map<number, ReturnType<typeof createPageItemHeightCalculator>>();
    const getHeightCalculator = (columnCount: number) => {
        const existing = heightCalculators.get(columnCount);
        if (existing) return existing;
        const calculator = createPageItemHeightCalculator(style, columnCount);
        heightCalculators.set(columnCount, calculator);
        return calculator;
    };
    const getItemHeight = (item: PageItem) => getHeightCalculator(currentPage.columns.length)(item);

    const getColumnLimit = (page: MutablePage) => baseColumnHeight - (page.mainHeader ? headerHeight : 0);
    const getCurrentColumnHeight = () => currentPage._columnHeights[currentColumnIndex];
    const getRemainingHeight = () => {
        const column = currentPage.columns[currentColumnIndex];
        const nextChunkGap = column.chunks.length > 0 ? CATEGORY_CHUNK_GAP_PX : 0;
        return getColumnLimit(currentPage) - getCurrentColumnHeight() - nextChunkGap;
    };
    const pageHasAnyContent = (page: MutablePage) =>
        Boolean(page.mainHeader) || page.columns.some((column) => column.chunks.length > 0);
    const getCurrentPageIndex = () => pages.length;

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
        const headerHeightValue = getItemHeight(headerItem);
        const firstContentHeight = getItemHeight(items[0]);
        const fullCategoryHeight = headerHeightValue + items.reduce((total, item) => total + getItemHeight(item), 0);

        if (
            !options.splitCategoryAcrossPages &&
            currentPage.mainHeader &&
            fullCategoryHeight > getColumnLimit(currentPage) &&
            fullCategoryHeight <= baseColumnHeight
        ) {
            startNextPage();
        }

        if (
            currentPage.mainHeader &&
            headerHeightValue + firstContentHeight > getColumnLimit(currentPage) &&
            headerHeightValue + firstContentHeight <= baseColumnHeight
        ) {
            startNextPage();
        }

        const columnLimit = getColumnLimit(currentPage);
        const canFitInSingleEmptyColumn = fullCategoryHeight <= columnLimit;
        const minStartHeight = headerHeightValue + firstContentHeight;

        if (canFitInSingleEmptyColumn && getCurrentColumnHeight() > 0 && getRemainingHeight() < fullCategoryHeight) {
            if (!options.splitCategoryAcrossPages || getRemainingHeight() < minStartHeight) {
                moveToNextColumnOrPage();
            }
        } else if (!canFitInSingleEmptyColumn && getCurrentColumnHeight() > 0 && getRemainingHeight() < minStartHeight) {
            moveToNextColumnOrPage();
        }

        if (fullCategoryHeight <= getRemainingHeight()) {
            pushChunk(category, true, [headerItem, ...items], fullCategoryHeight);
            return;
        }

        let remainingItems = [...items];
        let startsCategory = true;

        while (remainingItems.length > 0) {
            if (getRemainingHeight() <= 0 && getCurrentColumnHeight() > 0) {
                moveToNextColumnOrPage();
            }

            const availableHeight = getRemainingHeight();
            const columnWasEmpty = getCurrentColumnHeight() === 0;
            const chunkItems: PageItem[] = [];
            let chunkHeight = 0;

            if (startsCategory) {
                chunkItems.push(headerItem);
                chunkHeight += headerHeightValue;
            }

            while (remainingItems.length > 0) {
                const nextItem = remainingItems[0];
                const nextItemHeight = getItemHeight(nextItem);
                const fits = chunkHeight + nextItemHeight <= availableHeight;

                if (!fits && chunkItems.length > (startsCategory ? 1 : 0)) break;
                if (!fits && !columnWasEmpty) break;

                chunkItems.push(nextItem);
                chunkHeight += nextItemHeight;
                remainingItems.shift();

                if (!fits) break;
            }

            if (chunkItems.length === (startsCategory ? 1 : 0)) {
                moveToNextColumnOrPage();
                continue;
            }

            pushChunk(category, startsCategory, chunkItems, chunkHeight);
            startsCategory = false;

            if (remainingItems.length > 0) {
                moveToNextColumnOrPage();
            }
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
