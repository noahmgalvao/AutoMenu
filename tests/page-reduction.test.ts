import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STYLE } from '../src/domain/menu/defaults';
import { buildPageReductionCandidates, PAGE_REDUCTION_MARGIN_FLOOR, selectPageReduction } from '../src/domain/menu/pageReduction';
import type { Product } from '../src/domain/menu/model';
const products: Product[] = [{ id: 'one', category: 'A', name: 'Prato', price: 10, description: '', customMarginTop: 100 },
    { id: 'background', category: 'ft_zone_background', name: 'Fundo', price: 0, description: '', isFreeText: true, styles: { fontSize: 70 } },
    { id: 'note', category: 'A', name: 'Nota', price: 0, description: '', isFreeText: true, styles: { fontSize: 50 } }];

test('page reduction follows the requested order without changing artwork, current state or price spacing', () => {
    const style = { ...INITIAL_STYLE, pageBreaks: ['A'], categoryPositions: { A: { x: 10, y: 300, columnIndex: 0, pageIndex: 2 } },
        freeTextBackgrounds: { background: { x: 0, y: 0, width: 300, pageIndex: 0 } },
        margins: { top: 100, bottom: 100, left: 60, right: 10, columnGap: 30 },
        contentSpacing: { headerToContent: 90, categoryToProduct: 60, betweenProducts: 40, productToNextCategory: 60, productNameToDescription: 2, productNameToPrice: 38 },
    };
    const before = JSON.stringify({ style, products });
    const candidates = buildPageReductionCandidates(products, style);
    assert.deepEqual([...new Set(candidates.map(c => c.stage))], ['flow', 'spacing', 'fonts', 'margins', 'category-columns', 'product-columns']);
    for (const c of candidates) {
        assert.equal(c.style.contentSpacing?.productNameToPrice, 38);
        assert.equal(c.products[1], products[1]);
        assert.deepEqual(c.style.freeTextBackgrounds, style.freeTextBackgrounds);
        assert.ok((c.style.margins?.right || 0) <= 10);
    }
    const spacing = candidates.filter(c => c.stage === 'spacing').slice(-1)[0]!;
    assert.equal(spacing.style.contentSpacing?.betweenProducts, 5);
    assert.equal(spacing.style.contentSpacing?.productNameToDescription, 2);
    const fonts = candidates.filter(c => c.stage === 'fonts').slice(-1)[0]!;
    assert.equal(fonts.products[2].styles?.fontSize, 30);
    const end = candidates[candidates.length - 1]!;
    assert.equal(end.style.margins?.bottom, PAGE_REDUCTION_MARGIN_FLOOR);
    assert.equal(end.style.columnCount, 2);
    assert.equal(end.style.categoryColumnCount, 2);
    assert.equal(JSON.stringify({ style, products }), before);
    assert.equal(buildPageReductionCandidates(products, style, true)[0].style.columnCount, 2);
});

test('reduction stops at the first sufficient spacing and finds the lowest feasible page count', async () => {
    const candidates = buildPageReductionCandidates(products, INITIAL_STYLE);
    const controller = new AbortController();
    const calls: number[] = [];
    const result = await selectPageReduction(candidates, 5, async c => { const i = candidates.indexOf(c); calls.push(i); return i >= 7 ? 2 : 4; }, controller.signal);
    assert.equal(result?.pageCount, 2);
    assert.equal(result?.style, candidates[7].style);
    assert.ok(calls.length < 16);
    assert.equal(await selectPageReduction(candidates, 5, async () => 2, controller.signal, 1), null);
});

test('invalid, cancelled and non-reducing proposals never become a suggestion', async () => {
    const candidates = buildPageReductionCandidates(products, INITIAL_STYLE);
    assert.equal(await selectPageReduction(candidates, 2, async () => Infinity, new AbortController().signal), null);
    assert.equal(await selectPageReduction(candidates, 2, async () => 2, new AbortController().signal), null);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(selectPageReduction(candidates, 2, async () => 1, controller.signal), { name: 'AbortError' });
});
