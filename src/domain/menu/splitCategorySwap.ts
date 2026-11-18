import { FREE_TEXT_PREFIX } from './flow';
import type { MenuStyle, Product } from './model';
import {
    calculatePagination, finalizeMenuPages, getPaginationColumnLimit, getSavedCategoryPlacements,
    type CategoryPlacementAssignment, type PageLayout, type PaginationOptions,
} from './menuPagination';

type LayoutChange = { customCategoryOrder: string[] } & Pick<MenuStyle, 'categoryPositions' | 'categoryPlacements' | 'pageBreaks'>;

export interface SplitCategorySwap {
    category: string;
    replacement: string;
    layout: LayoutChange;
}

function readCategorySlots(pages: PageLayout[]) {
    const slots = new Map<string, { first: CategoryPlacementAssignment; chunks: number; lanes: Set<string>; productLanes: Set<string> }>();
    pages.forEach((page, pageIndex) => page.columns.forEach(({ columnIndex, chunks }) => chunks.forEach(chunk => {
        const lane = `${pageIndex}:${columnIndex}`;
        const current = slots.get(chunk.category) ?? { first: { pageIndex, columnIndex }, chunks: 0, lanes: new Set<string>(), productLanes: new Set<string>() };
        current.chunks++;
        current.lanes.add(lane);
        if (chunk.items.some(item => item.type === 'product-item' ? !item.data.isFreeText : item.type === 'product-row')) current.productLanes.add(lane);
        if (chunk.startsCategory) current.first = { pageIndex, columnIndex };
        slots.set(chunk.category, current);
    })));
    return slots;
}

const sameSlot = (left: CategoryPlacementAssignment, right: CategoryPlacementAssignment) =>
    left.pageIndex === right.pageIndex && left.columnIndex === right.columnIndex;

function swapKeys<T>(map: Record<string, T> | undefined, first: string, second: string) {
    if (!map || (!(first in map) && !(second in map))) return map;
    const next = { ...map };
    delete next[first];
    delete next[second];
    if (Object.prototype.hasOwnProperty.call(map, first)) next[second] = map[first];
    if (Object.prototype.hasOwnProperty.call(map, second)) next[first] = map[second];
    return next;
}

export function findSplitCategorySwap(
    products: Product[],
    style: MenuStyle,
    groupedProducts: Record<string, Product[]>,
    order: string[],
    basePages: PageLayout[],
    pages: PageLayout[],
    options: PaginationOptions,
): SplitCategorySwap | null {
    const slots = readCategorySlots(pages);
    const categories = order.filter(category => !category.startsWith(FREE_TEXT_PREFIX) && slots.get(category)?.productLanes.size);
    const split = categories.filter(category => slots.get(category)!.productLanes.size > 1);
    if (!split.length) return null;
    const baseSlots = readCategorySlots(basePages);
    const orderIndexes = new Map(order.map((category, index) => [category, index]));

    const fits = (layout: LayoutChange, category: string, replacement: string) => {
        const proposed = { ...style, ...layout };
        const updatedBase = calculatePagination(products, proposed, groupedProducts, layout.customCategoryOrder, getSavedCategoryPlacements(proposed), options);
        if (updatedBase.length > basePages.length) return false;
        if (updatedBase.some((page, pageIndex) => page.columns.some(column => {
            const limit = getPaginationColumnLimit(proposed, page, options);
            const previousHeight = basePages[pageIndex]?.columns[column.columnIndex]?.estimatedHeight ?? 0;
            return column.estimatedHeight > Math.max(limit, previousHeight) + 0.5;
        }))) return false;

        const updated = finalizeMenuPages(updatedBase, proposed);
        if (updated.length > pages.length) return false;
        const result = readCategorySlots(updated);
        if (result.size !== slots.size) return false;
        for (const [id, before] of slots) {
            const after = result.get(id);
            if (!after) return false;
            if (id === category || id === replacement) {
                const destination = slots.get(id === category ? replacement : category)!;
                if (after.chunks !== 1 || !sameSlot(after.first, destination.first)) return false;
            } else if (after.chunks > before.chunks || !sameSlot(after.first, before.first)
                || [...after.lanes].some(lane => !before.lanes.has(lane))) {
                return false;
            }
        }
        return true;
    };

    for (const category of split) {
        const origin = orderIndexes.get(category)!;
        const partners = categories.filter(candidate => candidate !== category).sort((a, b) => (
            slots.get(a)!.chunks - slots.get(b)!.chunks
            || Math.abs(orderIndexes.get(a)! - origin) - Math.abs(orderIndexes.get(b)! - origin)
        ));
        for (const replacement of partners) {
            const swap = (name: string) => name === category ? replacement : name === replacement ? category : name;
            const layout: LayoutChange = {
                customCategoryOrder: order.map(swap),
                categoryPositions: swapKeys(style.categoryPositions, category, replacement),
                categoryPlacements: swapKeys(style.categoryPlacements, category, replacement),
                pageBreaks: style.pageBreaks?.map(swap),
            };
            if (fits(layout, category, replacement)) return { category, replacement, layout };

            // Preserve the rendered lanes when the automatic flow would also move neighboring groups.
            const placements = Object.fromEntries([...baseSlots].map(([id, slot]) => [swap(id), slot.first]));
            const positions = layout.categoryPositions && { ...layout.categoryPositions };
            for (const id of [category, replacement]) {
                if (positions?.[id] && placements[id]) positions[id] = { ...positions[id], ...placements[id] };
            }
            const placedLayout = { ...layout, categoryPositions: positions, categoryPlacements: { ...layout.categoryPlacements, ...placements } };
            if (fits(placedLayout, category, replacement)) return { category, replacement, layout: placedLayout };
        }
    }
    return null;
}
