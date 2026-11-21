import { headingIsOnPage, menuHeadingFields, remapHeadingPages } from './menuHeadings';
import { categoryKey, categoryName } from './categoryName';
import { FREE_TEXT_PREFIX } from './flow';
import type { CopiedPageLayout, MenuStyle, Product } from './model';
import type { PageLayout } from './menuPagination';

export function duplicateMenuPage(page: PageLayout, pageIndex: number, products: Product[], style: MenuStyle) {
    const index = pageIndex + 1;
    const copyProducts: Product[] = [];
    const categoryCopies = new Map<string, { key: string; id: string }>();
    const productCopies = new Map<string, string>();
    const categoryKeys = new Set(products.map(product => product.category));
    const getCategoryCopy = (category: string) => {
        const existing = categoryCopies.get(category);
        if (existing) return existing;
        const id = crypto.randomUUID();
        const key = category.startsWith(FREE_TEXT_PREFIX) ? FREE_TEXT_PREFIX + id : categoryKey(categoryName(category), categoryKeys);
        const copy = { key, id };
        categoryCopies.set(category, copy);
        categoryKeys.add(key);
        return copy;
    };

    const copiedLayout: CopiedPageLayout = {
        showHeader: Boolean(page.mainHeader),
        columns: page.columns.map(column => column.chunks.map(chunk => {
            const category = getCategoryCopy(chunk.category);
            return {
                startsCategory: chunk.startsCategory,
                flowOffsetBefore: chunk.flowOffsetBefore,
                estimatedHeight: chunk.estimatedHeight,
                items: chunk.items.flatMap((item): CopiedPageLayout['columns'][number][number]['items'] => {
                    if (item.type === 'main-header') return [];
                    if (item.type === 'category-header') return [{ type: item.type }];
                    const list = Array.isArray(item.data) ? item.data : [item.data];
                    return [{ type: item.type, ids: list.map(product => {
                        const existing = productCopies.get(product.id);
                        if (existing) return existing;
                        const id = crypto.randomUUID();
                        productCopies.set(product.id, id);
                        copyProducts.push({ ...product, id, category: category.key, categoryId: category.id });
                        return id;
                    }) }];
                }),
            };
        })),
    };

    const shift = <T extends { pageIndex: number }>(value: T): T =>
        value.pageIndex >= index ? { ...value, pageIndex: value.pageIndex + 1 } : value;
    const extend = <T,>(source: Record<string, T> | undefined, keys: Map<string, string>, map: (value: T) => T = value => value) => {
        if (!source) return undefined;
        return {
            ...source,
            ...Object.fromEntries(Array.from(keys).filter(([id]) => source[id] !== undefined)
                .map(([id, copied]) => [copied, map(source[id])])),
        };
    };
    const shiftRecord = <T extends { pageIndex: number }>(source?: Record<string, T>) =>
        source && Object.fromEntries(Object.entries(source).map(([key, value]) => [key, shift(value)]));
    const clonePageAssets = <T extends { pageIndex: number }>(assets: T[] | undefined, clone: (asset: T) => T | null) =>
        [...(assets || []).map(shift), ...(assets || []).flatMap(asset => {
            if (asset.pageIndex !== pageIndex) return [];
            const copy = clone(asset);
            return copy ? [{ ...copy, pageIndex: index }] : [];
        })];
    const categoryMap = new Map(Array.from(categoryCopies, ([key, copy]) => [key, copy.key]));
    const duplicateId = crypto.randomUUID();
    const headingPages = remapHeadingPages(style, page => page >= index ? page + 1 : page);
    for (const field of menuHeadingFields) {
        const visible = headingPages?.[field];
        if (Array.isArray(visible) && headingIsOnPage(style, field, pageIndex, page.headerCopy)) visible.push(index);
    }
    const nextStyle: MenuStyle = {
        ...style,
        name: 'Custom',
        headingPages,
        blankPages: [
            ...(style.blankPages || []).map(slot => slot.index >= index ? { ...slot, index: slot.index + 1 } : slot),
            { id: duplicateId, index, fixedPosition: true, copiedLayout },
        ],
        addedImages: clonePageAssets(style.addedImages, image => image.repeatAsBackground ? null : { ...image, id: crypto.randomUUID() }),
        floatingText: clonePageAssets(style.floatingText, text => ({ ...text, id: crypto.randomUUID() })),
        pageBackgrounds: clonePageAssets(style.pageBackgrounds, background => background),
        categoryPositions: extend(shiftRecord(style.categoryPositions), categoryMap, position => ({ ...position, pageIndex: index })),
        categoryPlacements: shiftRecord(style.categoryPlacements),
        categoryImages: extend(style.categoryImages, categoryMap),
        categoryDividerStyles: extend(style.categoryDividerStyles, categoryMap),
        productDividerStyles: extend(style.productDividerStyles, productCopies),
        productImageFlips: extend(style.productImageFlips, productCopies),
        productPhotoCrops: extend(style.productPhotoCrops, productCopies),
        freeTextFills: extend(style.freeTextFills, productCopies),
        freeTextBorders: extend(style.freeTextBorders, productCopies),
        freeTextLayers: extend(style.freeTextLayers, productCopies),
        freeTextBackgrounds: shiftRecord(style.freeTextBackgrounds),
    };

    return { products: [...products, ...copyProducts], style: nextStyle, duplicateId, index };
}
