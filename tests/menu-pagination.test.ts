import assert from 'node:assert/strict';
import test from 'node:test';
import type { MenuStyle, Product } from '../src/domain/menu/model';
import {
  calculatePagination,
  finalizeMenuPages,
  getPaginationBottomInset,
  getPaginationHeightKey,
  getPaginationItemKey,
  getSavedCategoryPlacements,
  type PageItem,
} from '../src/domain/menu/menuPagination';
import { FREE_TEXT_PREFIX } from '../src/domain/menu/flow';
import { resolveMenuPageDimensions } from '../src/domain/menu/pageSetup';
import { convertMenuPageSetup } from '../src/domain/menu/convertMenuPageSetup';
import { findSplitCategorySwap } from '../src/domain/menu/splitCategorySwap';
import { resolveMenuMargins } from '../src/domain/menu/styleRules';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

const style: MenuStyle = { ...PRESET_TEMPLATES[0], categoryColumnCount: 2, columnCount: 1, layoutMode: 'list' };
const margins = resolveMenuMargins(style);
const dimensions = resolveMenuPageDimensions(style);
const columnWidth = (dimensions.widthPx - margins.left - margins.right - margins.columnGap) / 2;
const availableHeight = dimensions.heightPx - margins.top - getPaginationBottomInset(style);
const header = (category: string): PageItem => ({ type: 'category-header', data: category, category });
const product = (category: string): Product => ({
    id: category, category, name: category, price: 0, description: '', isFreeText: category.startsWith(FREE_TEXT_PREFIX),
});
const item = (data: Product): PageItem => ({ type: 'product-item', data, category: data.category });

const layOut = (categories: string[], style: MenuStyle, productHeight: number) => {
    const products = categories.map(product);
    const grouped = Object.fromEntries(products.map((entry) => [entry.category, [entry]]));
    const measuredHeights = new Map([['main-header', 100]]);
    for (const entry of products) {
        measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(header(entry.category)), columnWidth), 40);
        measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(item(entry)), columnWidth), productHeight);
    }
    return calculatePagination(products, style, grouped, categories, style.categoryPlacements, { measuredHeights });
};

test('a full preferred column tries the other column before creating a page', () => {
    const placements = Object.fromEntries(['A', 'B', 'C'].map((category) => [category, { pageIndex: 0, columnIndex: 1 }]));
    const pages = layOut(['A', 'B', 'C'], { ...style, categoryPlacements: placements }, availableHeight * 0.65);
    assert.deepEqual(pages[0].columns.map((column) => column.chunks.map((chunk) => chunk.category)), [['B'], ['A']]);
    assert.equal(pages[1].columns[0].chunks[0].category, 'C');
    assert.equal(pages.length, 2);
});

test('a saved vertical offset yields to a category that fits in the column', () => {
    const placement = { pageIndex: 0, columnIndex: 0 };
    const pages = layOut(['A'], {
        ...style,
        categoryPlacements: { A: placement },
        categoryPositions: { A: { ...placement, y: dimensions.heightPx - 5 } },
    }, 200);
    assert.equal(pages.length, 1);
    const chunk = pages[0].columns[0].chunks[0];
    assert.equal(chunk.category, 'A');
    assert.equal(chunk.estimatedHeight, 240);
    assert.equal(chunk.flowOffsetBefore, availableHeight - 100 - chunk.estimatedHeight);
});

test('a detached free text adds no empty gap to the category flow', () => {
    const freeText = `${FREE_TEXT_PREFIX}text`;
    const placement = { pageIndex: 0, columnIndex: 0 };
    const pages = layOut([freeText, 'A'], {
        ...style,
        categoryPlacements: { A: placement },
        categoryPositions: { [freeText]: { ...placement, y: 20 } },
    }, availableHeight - 140);
    assert.equal(pages.length, 1);
    assert.deepEqual(pages[0].columns[0].chunks.map((chunk) => chunk.category), [freeText, 'A']);
    assert.equal(pages[0].columns[0].estimatedHeight, availableHeight - 100);
});

test('landscape temporarily widens the category layout and portrait restores it exactly', () => {
    const setup = dimensions.setup;
    const original: MenuStyle = {
        ...style, pageSetup: setup, categoryColumnWidths: [0.38, 0.62],
        categoryPositions: { A: { pageIndex: 0, columnIndex: 1, pageX: 480, y: margins.top } },
        categoryPlacements: { A: { pageIndex: 0, columnIndex: 1 } },
        customProductOrder: { A: ['a2', 'a1'] },
    };
    const landscape = convertMenuPageSetup(original, { ...setup, orientation: 'landscape' }, new Map());
    assert.equal(landscape.categoryColumnCount, 3);
    const resized = convertMenuPageSetup(landscape, { ...setup, preset: 'A5', orientation: 'landscape' }, new Map());
    const reopened = JSON.parse(JSON.stringify(resized)) as MenuStyle;
    const portrait = convertMenuPageSetup(reopened, setup, new Map());
    assert.equal(portrait.categoryColumnCount, original.categoryColumnCount);
    assert.equal(portrait.columnCount, original.columnCount);
    assert.deepEqual(portrait.categoryColumnWidths, original.categoryColumnWidths);
    assert.deepEqual(portrait.categoryPositions, original.categoryPositions);
    assert.deepEqual(portrait.categoryPlacements, original.categoryPlacements);
    assert.deepEqual(portrait.customProductOrder, original.customProductOrder);
    assert.equal(convertMenuPageSetup({ ...original, columnCount: 3 }, {
        ...setup, orientation: 'landscape',
    }, new Map()).categoryColumnCount, 2);
});

for (const columnCount of [1, 2] as const) {
    test(`suggests a category exchange that removes a split across ${columnCount === 1 ? 'pages' : 'columns'}`, () => {
        const layoutStyle: MenuStyle = { ...style, categoryColumnCount: columnCount, design: undefined };
        const width = columnCount === 1 ? dimensions.widthPx - margins.left - margins.right : columnWidth;
        const firstLaneCapacity = availableHeight - 100;
        const groups = {
            A: [product('A')],
            B: [1, 2, 3].map(id => ({ ...product('B'), id: `B${id}` })),
            C: [product('C')],
        };
        const order = Object.keys(groups);
        const products = Object.values(groups).flat();
        const measuredHeights = new Map([['main-header', 100]]);
        for (const category of order) {
            measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(header(category)), width), 40);
        }
        for (const entry of products) {
            const part = entry.category === 'A' ? 0.56 : entry.category === 'B' ? 0.24 : 0.18;
            measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(item(entry)), width), firstLaneCapacity * part);
        }
        const options = { measuredHeights, splitCategoryAcrossPages: true };
        const initial = calculatePagination(products, layoutStyle, groups, order, null, options);
        const chunks = (pages: typeof initial, category: string) => pages.flatMap(page => page.columns.flatMap(
            column => column.chunks.filter(chunk => chunk.category === category),
        ));
        assert.equal(chunks(initial, 'B').length, 2);
        const swap = findSplitCategorySwap(products, layoutStyle, groups, order, initial, finalizeMenuPages(initial, layoutStyle), options);
        assert.equal(swap?.category, 'B');
        assert.equal(swap?.replacement, 'C');
        assert.ok(swap);
        const revisedStyle = { ...layoutStyle, ...swap.layout };
        const revised = calculatePagination(products, revisedStyle, groups, swap.layout.customCategoryOrder, getSavedCategoryPlacements(revisedStyle), options);
        assert.equal(chunks(revised, 'A').length, 1);
        assert.equal(chunks(revised, 'B').length, 1);
        assert.equal(chunks(revised, 'C').length, 1);
        assert.deepEqual(revised[0].columns[0].chunks.map(chunk => chunk.category), ['A', 'C']);

        const noPartner = ['A', 'B'];
        const withoutPartner = calculatePagination(products, layoutStyle, groups, noPartner, null, options);
        assert.equal(findSplitCategorySwap(products, layoutStyle, groups, noPartner, withoutPartner, withoutPartner, options), null);
    });
}
