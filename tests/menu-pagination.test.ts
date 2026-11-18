import assert from 'node:assert/strict';
import test from 'node:test';
import type { MenuStyle, Product } from '../src/domain/menu/model';
import {
  calculatePagination,
  getPaginationBottomInset,
  getPaginationHeightKey,
  getPaginationItemKey,
  type PageItem,
} from '../src/domain/menu/menuPagination';
import { FREE_TEXT_PREFIX } from '../src/domain/menu/flow';
import { resolveMenuPageDimensions } from '../src/domain/menu/pageSetup';
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
