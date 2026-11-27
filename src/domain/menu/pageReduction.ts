import type { MenuStyle, Product } from './model';
import { INITIAL_STYLE } from './defaults';
import { resolveMenuContentSpacing, resolveMenuMargins, resolveMinimumFontSize } from './styleRules';

export interface PageReductionState { products: Product[]; style: MenuStyle }
export interface PageReductionCandidate extends PageReductionState { stage: string; endpoint: boolean }
export const PAGE_REDUCTION_MARGIN_FLOOR = 20; // CSS px, approximately 5.3 mm at print size.
export const PAGE_REDUCTION_FONT_FACTOR = .6;
const interpolate = (value: number, floor: number, progress: number) => Math.round((value + (Math.min(value, floor) - value) * progress) * 10) / 10;
const textFields = ['menuTitle', 'menuSubtitle', 'category', 'productName', 'productDescription', 'productPrice'] as const;

/** Ordered, immutable proposals. Only a measured proposal may be offered to the user. */
export function buildPageReductionCandidates(products: Product[], style: MenuStyle, columnsFirst = false): PageReductionCandidate[] {
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
    const add = (stage: string, endpoint = false) => result.push({ ...current, stage, endpoint });
    const columns = (both: boolean) => {
        current = { ...current, style: { ...current.style, categoryColumnCount: Math.max(2, style.categoryColumnCount || 1) as MenuStyle['columnCount'],
            categoryColumnWidths: undefined,
            ...(both ? { columnCount: Math.max(2, style.columnCount) as MenuStyle['columnCount'], categoryProductColumnCounts: undefined } : {}),
        } };
    };
    if (columnsFirst) columns(true);
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
    if (!columnsFirst) { columns(false); add('category-columns', true); columns(true); add('product-columns', true); }
    return result;
}

export interface MeasuredReduction extends PageReductionCandidate { pageCount: number }
/** At most six stage endpoints and logarithmic probes, rather than rendering every intermediate proposal. */
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
    // The first passing stage is preferred; this stops spacing/font changes as soon as enough.
    let low = 0, high = end;
    const desired = target ?? bestCount;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (await read(middle) <= desired) high = middle; else low = middle + 1;
    }
    const pageCount = await read(low);
    return Number.isFinite(pageCount) && pageCount <= desired ? { ...candidates[low], pageCount } : null;
}
