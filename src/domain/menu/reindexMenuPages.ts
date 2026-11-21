import { headingIsOnPage, menuHeadingFields } from './menuHeadings';
import type { BlankPageSlot, MenuStyle } from './model';
import type { PageLayout } from './menuPagination';

export function reindexMenuPages(style: MenuStyle, pages: PageLayout[], order: number[]): MenuStyle {
    const destination = new Map(order.map((index, next) => [index, next]));
    const mapIndex = (index: number) => destination.get(index) ?? index;
    const move = <T extends { pageIndex: number }>(value: T): T => ({
        ...value, pageIndex: mapIndex(value.pageIndex),
    });
    const moveRecord = <T extends { pageIndex: number }>(values?: Record<string, T>) =>
        Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, move(value)]));
    const categoryPlacements = moveRecord(style.categoryPlacements);
    const chunksByCategory = new Map<string, Set<number>>();
    pages.forEach((page, index) => page.columns.forEach(column => column.chunks.forEach(chunk => {
        const locations = chunksByCategory.get(chunk.category) ?? new Set<number>();
        if (!locations.size) categoryPlacements[chunk.category] = { pageIndex: mapIndex(index), columnIndex: column.columnIndex };
        locations.add(index);
        chunksByCategory.set(chunk.category, locations);
    })));
    // A continuation can end up before its category heading after a swap.
    // Keep the rendered portions on their own pages in that case.
    const splitPages = new Set(Array.from(chunksByCategory.values(), locations => [...locations])
        .filter(locations => locations.some((index, offset) =>
            mapIndex(index) - mapIndex(locations[0]) !== index - locations[0]))
        .flat());
    const savedSlots = new Map(style.blankPages?.map(slot => [slot.index, slot]));
    const blankPages = order.flatMap((previousIndex, index): BlankPageSlot[] => {
        const page = pages[previousIndex];
        const slot = savedSlots.get(previousIndex);
        if (slot?.copiedLayout) return [{ ...slot, index }];
        const hasItems = page?.columns.some(column => column.chunks.length);
        if (!hasItems || splitPages.has(previousIndex)) {
            return [{
                id: slot?.id ?? crypto.randomUUID(), index, fixedPosition: true,
                copiedLayout: hasItems ? {
                    showHeader: Boolean(page.mainHeader),
                    columns: page.columns.map(column => column.chunks.map(chunk => ({
                        startsCategory: chunk.startsCategory,
                        flowOffsetBefore: chunk.flowOffsetBefore,
                        estimatedHeight: chunk.estimatedHeight,
                        items: chunk.items.flatMap(item => item.type === 'main-header' ? []
                            : [item.type === 'category-header' ? { type: item.type }
                                : { type: item.type, ids: (Array.isArray(item.data) ? item.data : [item.data]).map(product => product.id) }]),
                    }))),
                } : undefined,
            }];
        }
        return slot ? [{ ...slot, index }] : [];
    });

    return {
        ...style, name: 'Custom', blankPages, categoryPlacements,
        headingPages: Object.fromEntries(menuHeadingFields.map(field => [field, style.headingPages?.[field] === 'all'
            ? 'all' : pages.flatMap((page, index) =>
                headingIsOnPage(style, field, index, page.headerCopy) ? [mapIndex(index)] : [])])),
        categoryPositions: moveRecord(style.categoryPositions),
        freeTextBackgrounds: moveRecord(style.freeTextBackgrounds),
        addedImages: style.addedImages?.map(move),
        floatingText: style.floatingText?.map(move),
        pageBackgrounds: style.pageBackgrounds?.map(move),
    };
}
