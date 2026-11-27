import type { MenuStyle, Product } from './model';
import { getMenuColumnLimit, getProductColumnCount } from './categoryColumns';
import { INITIAL_STYLE } from './defaults';
import { resolveMenuContentSpacing, resolveMenuMargins, resolveMinimumFontSize } from './styleRules';

export interface PageReductionState { products: Product[]; style: MenuStyle }
export interface PageReductionCandidate extends PageReductionState { stage: string; endpoint: boolean; columnChange?: boolean }
export interface PageReductionColumns { categories: number; products: number }
export const PAGE_REDUCTION_MARGIN_FLOOR = 20; // CSS px, approximately 5.3 mm at print size.
export const PAGE_REDUCTION_FONT_FACTOR = .6;
const interpolate = (value: number, floor: number, progress: number) => Math.round((value + (Math.min(value, floor) - value) * progress) * 10) / 10;
const textFields = ['menuTitle', 'menuSubtitle', 'category', 'productName', 'productDescription', 'productPrice'] as const;

/** Try the requested landscape pairs first. Extra product lanes are last-resort
 * candidates and still have to pass the renderer's minimum word/price width checks. */
export function getPageReductionColumnOptions(style: MenuStyle): PageReductionColumns[] {
    const landscape = style.pageSetup?.orientation === 'landscape';
    const baseCategories = style.categoryColumnCount || 1;
    const categoryCounts = landscape ? [2, 3, 4] : [2];
    if (baseCategories > categoryCounts[categoryCounts.length - 1]) categoryCounts.push(baseCategories);
    const pairs = categoryCounts.flatMap(categories => [1, 2].map(products => ({ categories, products })));
    for (let products = 3; products <= getMenuColumnLimit(style); products++) {
        for (const categories of categoryCounts) pairs.push({ categories, products });
    }
    const seen = new Set<string>();
    const original = columnSignature(style);
    return pairs.filter(pair => {
        if (pair.categories < baseCategories) return false;
        const next = applyReductionColumns(style, pair);
        const signature = columnSignature(next);
        if (signature === original || seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
}

function columnSignature(style: MenuStyle) {
    return JSON.stringify([style.categoryColumnCount || 1, style.columnCount,
        Object.entries(style.categoryProductColumnCounts || {}).sort(([a], [b]) => a.localeCompare(b))]);
}

export function applyReductionColumns(style: MenuStyle, columns: PageReductionColumns): MenuStyle {
    const categories = Math.max(style.categoryColumnCount || 1, columns.categories) as MenuStyle['columnCount'];
    return { ...style, categoryColumnCount: categories,
        categoryColumnWidths: categories === (style.categoryColumnCount || 1) ? style.categoryColumnWidths : undefined,
        columnCount: Math.max(style.columnCount, columns.products) as MenuStyle['columnCount'],
        categoryProductColumnCounts: style.categoryProductColumnCounts && Object.fromEntries(
            Object.entries(style.categoryProductColumnCounts).map(([category, count]) => [category, Math.max(count, columns.products) as MenuStyle['columnCount']])),
    };
}

/** An alternative can add lanes, but cannot undo any of the first option's lanes. */
export function hasMoreReductionColumns(next: MenuStyle, first: MenuStyle) {
    const categories = new Set([...Object.keys(next.categoryProductColumnCounts || {}), ...Object.keys(first.categoryProductColumnCounts || {})]);
    if ((next.categoryColumnCount || 1) < (first.categoryColumnCount || 1) || next.columnCount < first.columnCount) return false;
    let more = (next.categoryColumnCount || 1) > (first.categoryColumnCount || 1) || next.columnCount > first.columnCount;
    for (const category of categories) {
        const before = getProductColumnCount(first, category), after = getProductColumnCount(next, category);
        if (after < before) return false;
        if (after > before) more = true;
    }
    return more;
}

/** Ordered, immutable proposals. Only a measured proposal may be offered to the user. */
export function buildPageReductionCandidates(products: Product[], style: MenuStyle, initialColumns?: PageReductionColumns): PageReductionCandidate[] {
    const backgroundIds = new Set(Object.keys(style.freeTextBackgrounds || {}));
    const nextProducts = products.map(product => backgroundIds.has(product.id) ? product : { ...product, customMarginTop: 0 });
    const hasPageObject = (index: number) => [
        ...(style.addedImages || []), ...(style.floatingText || []), ...(style.pageBackgrounds || []),
        ...Object.values(style.freeTextBackgrounds || {}),
    ].some(object => object.pageIndex === index);
    let current: PageReductionState = { products: nextProducts, style: {
        ...style, name: 'Custom', pageBreaks: [], categoryPlacements: undefined,
        categoryPositions: Object.fromEntries(Object.entries(style.categoryPositions || {}).filter(([key]) =>
            [...backgroundIds].some(id => key === `ft_zone_${id}`))),
        // Copied layouts contain real references; retain them and all pages carrying artwork.
        blankPages: style.blankPages?.filter(page => page.copiedLayout || hasPageObject(page.index)),
    } };
    const result: PageReductionCandidate[] = [];
    const add = (stage: string, endpoint = false, columnChange = false) => result.push({ ...current, stage, endpoint, columnChange });
    if (initialColumns) current = { ...current, style: applyReductionColumns(current.style, initialColumns) };
    add('flow', true);
    const spacing = resolveMenuContentSpacing(current.style);
    const beforeSpacing = current;
    for (let step = 1; step <= 10; step++) {
        const progress = step / 10;
        current = { ...beforeSpacing, style: { ...beforeSpacing.style,
            contentSpacing: { ...spacing, ...Object.fromEntries(Object.entries(spacing)
                .filter(([key]) => key !== 'productNameToPrice').map(([key, value]) => [key, interpolate(value, 5, progress)])) },
            elementStyles: Object.fromEntries(Object.entries(beforeSpacing.style.elementStyles).map(([key, value]) => [key,
                value?.marginBottom === undefined ? value : { ...value, marginBottom: interpolate(value.marginBottom, 5, progress) }])) as MenuStyle['elementStyles'],
        } };
        add('spacing', step === 10);
    }
    const beforeFonts = current, minimum = resolveMinimumFontSize(style);
    for (let step = 1; step <= 10; step++) {
        const factor = 1 - (1 - PAGE_REDUCTION_FONT_FACTOR) * step / 10;
        const size = (value: number) => Math.round(Math.max(minimum, value * factor) * 10) / 10;
        const elementStyles = { ...beforeFonts.style.elementStyles };
        for (const key of textFields) elementStyles[key] = { ...elementStyles[key],
            fontSize: size(elementStyles[key]?.fontSize ?? INITIAL_STYLE.elementStyles[key]?.fontSize ?? 18) };
        const overrides = beforeFonts.style.itemFormattingOverrides;
        const scaledOverrides = overrides && Object.fromEntries(Object.entries(overrides).map(([kind, items]) => [kind,
            Object.fromEntries(Object.entries(items).map(([id, item]) => [id, { ...item,
                elementStyles: item.elementStyles && Object.fromEntries(Object.entries(item.elementStyles).map(([key, value]) => [key,
                    value?.fontSize ? { ...value, fontSize: size(value.fontSize) } : value])),
            }]))]));
        current = { style: { ...beforeFonts.style, elementStyles, itemFormattingOverrides: scaledOverrides },
            products: beforeFonts.products.map(product => product.isFreeText && !backgroundIds.has(product.id)
                ? { ...product, styles: { ...product.styles, fontSize: size(product.styles?.fontSize ?? 18) } } : product),
        };
        add('fonts', step === 10);
    }
    const beforeMargins = current, margins = resolveMenuMargins(current.style);
    for (let step = 1; step <= 10; step++) {
        current = { ...beforeMargins, style: { ...beforeMargins.style,
            margins: { ...margins, ...Object.fromEntries(['top', 'bottom', 'left', 'right'].map(key => [key,
                interpolate(margins[key as keyof typeof margins], PAGE_REDUCTION_MARGIN_FLOOR, step / 10)])) },
        } };
        add('margins', step === 10);
    }
    if (!initialColumns) {
        const beforeColumns = current;
        for (const columns of getPageReductionColumnOptions(style)) {
            current = { ...beforeColumns, style: applyReductionColumns(beforeColumns.style, columns) };
            add(columns.products > 1 ? 'product-columns' : 'category-columns', true, true);
        }
    }
    return result;
}

export interface MeasuredReduction extends PageReductionCandidate { pageCount: number }
/** Measure stage endpoints and column pairs, refining only the first sufficient continuous stage. */
export async function selectPageReduction(candidates: PageReductionCandidate[], currentPages: number,
    measure: (candidate: PageReductionCandidate) => Promise<number>, signal: AbortSignal, target?: number): Promise<MeasuredReduction | null> {
    const cache = new Map<number, number>();
    const read = async (index: number) => {
        signal.throwIfAborted();
        if (!cache.has(index)) cache.set(index, await measure(candidates[index]));
        signal.throwIfAborted();
        return cache.get(index)!;
    };
    let bestCount = currentPages, end = -1;
    for (let index = 0; index < candidates.length; index++) {
        if (!candidates[index].endpoint) continue;
        const count = await read(index);
        if (count < bestCount) { bestCount = count; end = index; }
        if (count <= (target ?? 1)) { end = index; bestCount = count; break; }
    }
    if (end < 0 || bestCount >= currentPages || (target !== undefined && bestCount > target)) return null;
    // Column pairs are discrete and follow the requested order. Refine only
    // a continuous spacing/font/margin stage, never a change of column pair.
    const desired = target ?? bestCount;
    end = [...cache].filter(([index, count]) => candidates[index].endpoint && count <= desired)
        .sort(([a], [b]) => a - b)[0][0];
    if (candidates[end].columnChange) return { ...candidates[end], pageCount: await read(end) };
    let low = end, high = end;
    while (low > 0 && candidates[low - 1].stage === candidates[end].stage && !candidates[low - 1].columnChange) low--;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (await read(middle) <= desired) high = middle; else low = middle + 1;
    }
    const pageCount = await read(low);
    return Number.isFinite(pageCount) && pageCount <= desired ? { ...candidates[low], pageCount } : null;
}

export async function selectPageReductionAlternative(products: Product[], style: MenuStyle, first: MeasuredReduction,
    currentPages: number, measure: (candidate: PageReductionCandidate) => Promise<number>, signal: AbortSignal) {
    for (const columns of getPageReductionColumnOptions(style)) {
        signal.throwIfAborted();
        if (!hasMoreReductionColumns(applyReductionColumns(style, columns), first.style)) continue;
        const second = await selectPageReduction(buildPageReductionCandidates(products, style, columns), currentPages,
            measure, signal, first.pageCount);
        if (second && second.pageCount === first.pageCount) return second;
    }
    return null;
}
