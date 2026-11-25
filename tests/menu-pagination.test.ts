import assert from 'node:assert/strict';
import test from 'node:test';
import type { MenuStyle, Product } from '../src/domain/menu/model';
import {
  calculatePagination,
  getPaginationBottomInset,
  getCategoryFitRegression,
  getMenuTypographyScale,
  getPaginationHeightKey,
  getPaginationItemKey,
  type PageItem,
} from '../src/domain/menu/menuPagination';
import { FREE_TEXT_PREFIX } from '../src/domain/menu/flow';
import { resolveMenuPageDimensions } from '../src/domain/menu/pageSetup';
import { convertMenuPageSetup } from '../src/domain/menu/convertMenuPageSetup';
import { resolveMenuContentSpacing, resolveMenuMargins } from '../src/domain/menu/styleRules';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

const style: MenuStyle = { ...PRESET_TEMPLATES[0], templateHeadingVisibility: undefined, splitCategoryAcrossPages: undefined, categoryColumnCount: 2, columnCount: 1, layoutMode: 'list' };
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

test('the distance from a product to the next category participates in column fit', () => {
    const preferences = { A: { pageIndex: 0, columnIndex: 0 }, B: { pageIndex: 0, columnIndex: 0 } };
    const singleColumn: MenuStyle = { ...style, categoryColumnCount: 1, categoryPlacements: preferences };
    const spacing = resolveMenuContentSpacing(singleColumn);
    const compact = { ...singleColumn, contentSpacing: { ...spacing, productToNextCategory: 0 } };
    const spacious = { ...singleColumn, contentSpacing: { ...spacing, productToNextCategory: 100 } };
    const height = (menu: MenuStyle) => layOut(['A', 'B'], menu, 100)[0].columns[0].estimatedHeight;
    assert.equal(height(singleColumn) - height(compact), spacing.productToNextCategory);
    assert.equal(height(spacious) - height(compact), 100);
    const automatic = { ...singleColumn, categoryPlacements: undefined };
    assert.equal(height({ ...automatic, contentSpacing: spacious.contentSpacing })
        - height({ ...automatic, contentSpacing: compact.contentSpacing }), 100);
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
    const products = ['A', 'B', 'C'].map(product);
    const original: MenuStyle = {
        ...style, pageSetup: setup, categoryColumnWidths: [0.38, 0.62],
        categoryPositions: { A: { pageIndex: 0, columnIndex: 1, pageX: 480, y: margins.top } },
        categoryPlacements: { A: { pageIndex: 0, columnIndex: 1 } },
        customProductOrder: { A: ['a2', 'a1'] },
    };
    const landscape = convertMenuPageSetup(original, { ...setup, orientation: 'landscape' }, new Map(), products);
    assert.equal(landscape.categoryColumnCount, 3);
    const resized = convertMenuPageSetup(landscape, { ...setup, preset: 'A5', orientation: 'landscape' }, new Map(), products);
    const reopened = JSON.parse(JSON.stringify(resized)) as MenuStyle;
    const portrait = convertMenuPageSetup(reopened, setup, new Map(), products);
    assert.equal(portrait.categoryColumnCount, original.categoryColumnCount);
    assert.equal(portrait.columnCount, original.columnCount);
    assert.deepEqual(portrait.categoryColumnWidths, original.categoryColumnWidths);
    assert.deepEqual(portrait.categoryPositions, original.categoryPositions);
    assert.deepEqual(portrait.categoryPlacements, original.categoryPlacements);
    assert.deepEqual(portrait.customProductOrder, original.customProductOrder);
    assert.equal(convertMenuPageSetup({ ...original, columnCount: 3 }, {
        ...setup, orientation: 'landscape',
    }, new Map(), products).categoryColumnCount, 2);
});

test('landscape chooses one column per visible category up to three', () => {
    const original: MenuStyle = {
        ...style, pageSetup: dimensions.setup, categoryColumnCount: 3, hiddenProductIds: ['Hidden'],
        categoryPositions: { A: { pageIndex: 0, columnIndex: 2, y: 150 } },
    };
    const ignored = [product('Hidden'), product(`${FREE_TEXT_PREFIX}note`)];
    const landscape = (categories: string[]) => convertMenuPageSetup(original, {
        ...dimensions.setup, orientation: 'landscape',
    }, new Map(), [...categories.map(product), ...ignored]);
    assert.equal(landscape([]).categoryColumnCount, 1);
    assert.equal(landscape(['A', 'A']).categoryColumnCount, 1);
    assert.equal(landscape(['A', 'A', 'B']).categoryColumnCount, 2);
    assert.equal(landscape(['A', 'B', 'C', 'D']).categoryColumnCount, 3);
    const singleColumn = landscape(['A']);
    assert.equal(singleColumn.categoryPositions?.A.columnIndex, 0);
    assert.deepEqual(convertMenuPageSetup(singleColumn, dimensions.setup, new Map(), [product('A')]).categoryPositions,
        original.categoryPositions);
});

test('keeps a category whole in both automatic and saved layouts, including legacy split settings', () => {
    const layoutStyle: MenuStyle = { ...style, design: undefined, splitCategoryAcrossPages: true };
    const groups = {
        A: [product('A')],
        B: [1, 2, 3].map(id => ({ ...product('B'), id: `B${id}` })),
    };
    const products = Object.values(groups).flat();
    const measuredHeights = new Map([['main-header', 100]]);
    for (const category of Object.keys(groups)) {
        measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(header(category)), columnWidth), 40);
    }
    for (const entry of products) {
        const height = availableHeight * (entry.category === 'A' ? 0.55 : 0.2);
        measuredHeights.set(getPaginationHeightKey(getPaginationItemKey(item(entry)), columnWidth), height);
    }
    for (const placements of [null, { A: { pageIndex: 0, columnIndex: 0 }, B: { pageIndex: 0, columnIndex: 0 } }]) {
        const pages = calculatePagination(products, layoutStyle, groups, ['A', 'B'], placements, { measuredHeights });
        const chunks = pages.flatMap(page => page.columns.flatMap(column => column.chunks)).filter(chunk => chunk.category === 'B');
        assert.equal(chunks.length, 1);
        assert.equal(chunks[0].items.length, 4);
        assert.equal(chunks[0].columnIndex, 1);
    }
});

test('shrinks tall categories under the title and accepts three-column additions until the page is full', () => {
    const layoutStyle: MenuStyle = {
        ...style, columnCount: 3, categoryColumnCount: 1, layoutMode: 'cards', showImages: false,
        menuTitle: 'Cardápio', templateHeadingVisibility: undefined,
        elementStyles: {
            ...style.elementStyles, menuTitle: { fontSize: 85 }, category: { fontSize: 54 },
            productName: { fontSize: 42 }, productDescription: { fontSize: 28 }, productPrice: { fontSize: 31 },
        },
    };
    const products = Array.from({ length: 18 }, (_, id) => ({
        ...product('A'), id: String(id), name: 'Prato da casa', description: 'Acompanhamento da estação',
    }));
    const groups = (entries: Product[]) => ({ A: entries });
    const order = ['A'];
    const scale = getMenuTypographyScale(layoutStyle, groups(products), order);
    assert.ok(scale > 0 && scale < 1);
    assert.equal(getMenuTypographyScale(layoutStyle, groups(products.slice(0, 3)), order), 1);
    const pages = calculatePagination(products, layoutStyle, groups(products), order);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].columns[0].chunks[0].items.length, 7);

    const sort = { field: 'name', direction: 'asc' } as const;
    const more = [...products, { ...products[0], id: 'new' }];
    assert.equal(getCategoryFitRegression(products, layoutStyle, more, layoutStyle, sort), undefined);
    const full = Array.from({ length: 180 }, (_, id) => ({ ...products[0], id: String(id) }));
    assert.equal(getCategoryFitRegression(more, layoutStyle, full, layoutStyle, sort), 'A');
});
