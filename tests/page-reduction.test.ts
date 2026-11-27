import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STYLE } from '../src/domain/menu/defaults';
import { buildPageReductionCandidates, getPageReductionColumnOptions, applyReductionColumns, hasMoreReductionColumns, selectPageReductionAlternative, PAGE_REDUCTION_MARGIN_FLOOR, selectPageReduction } from '../src/domain/menu/pageReduction';
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
    assert.equal(buildPageReductionCandidates(products, style, {categories: 2, products: 2})[0].style.columnCount, 2);
});

test('reduction stops at the first sufficient spacing and finds the lowest feasible page count', async () => {
    const candidates = buildPageReductionCandidates(products, INITIAL_STYLE);
    const controller = new AbortController();
    const calls: number[] = [];
    const result = await selectPageReduction(candidates, 5, async c => { const i = candidates.indexOf(c); calls.push(i); return i >= 7 ? 2 : 4; }, controller.signal);
    assert.equal(result?.pageCount, 2);
    assert.equal(result?.style, candidates[7].style);
    assert.ok(calls.length < 20);
    assert.equal(await selectPageReduction(candidates, 5, async () => 2, controller.signal, 1), null);
});

test('invalid, cancelled and non-reducing proposals never become a suggestion', async () => {
    const candidates = buildPageReductionCandidates(products, INITIAL_STYLE);
    assert.equal(await selectPageReduction(candidates, 2, async () => Infinity, new AbortController().signal), null);
    assert.equal(await selectPageReduction(candidates, 2, async () => 2, new AbortController().signal), null);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(selectPageReduction(candidates, 2, async () => 1, controller.signal), { name: 'AbortError' });
});

test('landscape follows 2×1, 2×2, 3×1, 3×2, 4×1, 4×2 before extra product lanes', () => {
    const style = { ...INITIAL_STYLE, pageSetup: { ...INITIAL_STYLE.pageSetup!, orientation: 'landscape' as const } };
    const options = getPageReductionColumnOptions(style);
    assert.deepEqual(options.slice(0, 6), [
        { categories: 2, products: 1 }, { categories: 2, products: 2 },
        { categories: 3, products: 1 }, { categories: 3, products: 2 },
        { categories: 4, products: 1 }, { categories: 4, products: 2 },
    ]);
    assert.ok(options.some(c => c.categories === 4 && c.products === 5));
    assert.ok(options.every(c => c.categories <= 4 && c.products <= 5));
});

test('portrait and landscape preserve global and individual column floors and existing widths', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
        const style = { ...INITIAL_STYLE, columnCount: 3 as const, categoryColumnCount: 3 as const,
            categoryColumnWidths: [.2,.3,.5], categoryProductColumnCounts: { A: 1 as const, B: 4 as const },
            pageSetup: { ...INITIAL_STYLE.pageSetup!, orientation },
        };
        for (const pair of getPageReductionColumnOptions(style)) {
            const candidate = applyReductionColumns(style, pair);
            assert.ok(candidate.categoryColumnCount! >= 3);
            assert.ok(candidate.columnCount >= 3);
            assert.ok(candidate.categoryProductColumnCounts!.A >= 1);
            assert.ok(candidate.categoryProductColumnCounts!.B >= 4);
            if (candidate.categoryColumnCount === 3) assert.equal(candidate.categoryColumnWidths, style.categoryColumnWidths);
        }
        const categoryOnly = applyReductionColumns(style, {categories:4,products:1});
        assert.equal(categoryOnly.columnCount,3);
        assert.deepEqual(categoryOnly.categoryProductColumnCounts,style.categoryProductColumnCounts);
    }
});

test('discrete column pairs do not skip an earlier valid combination when denser pairs fail word limits', async () => {
    const style = { ...INITIAL_STYLE, pageSetup: { ...INITIAL_STYLE.pageSetup!, orientation: 'landscape' as const } };
    const candidates = buildPageReductionCandidates(products, style);
    const result = await selectPageReduction(candidates, 6, async c => {
        if (!c.columnChange) return 6;
        const a = c.style.categoryColumnCount, b = c.style.columnCount;
        if (a === 2 && b === 2 || a === 3 && b === 1) return 2;
        return Infinity;
    },new AbortController().signal);
    assert.equal(result?.pageCount,2);
    assert.equal(result?.style.categoryColumnCount,2);
    assert.equal(result?.style.columnCount,2);
});

test('a second option exists after a 2×2 first result when 3×2 can fit, while prohibited lanes are skipped', async () => {
    const style = { ...INITIAL_STYLE, pageSetup: { ...INITIAL_STYLE.pageSetup!, orientation: 'landscape' as const } };
    const first = { ...buildPageReductionCandidates(products,style,{categories:2,products:2})[0], pageCount:1 };
    const seen: string[] = [];
    const second = await selectPageReductionAlternative(products,style,first,5,async c=>{
        seen.push(`${c.style.categoryColumnCount}x${c.style.columnCount}`);
        if(c.style.categoryColumnCount===3 && c.style.columnCount===2) return Infinity;
        return c.style.categoryColumnCount===4 && c.style.columnCount===2 ? 1 : 5;
    },new AbortController().signal);
    assert.equal(second?.style.categoryColumnCount,4);
    assert.equal(second?.style.columnCount,2);
    assert.ok(second && hasMoreReductionColumns(second.style,first.style));
    assert.ok(!seen.includes('3x1'));
    assert.ok(!hasMoreReductionColumns(applyReductionColumns(style,{categories:4,products:1}),first.style));
});

test('product column fallbacks can keep increasing when the smaller prescribed pairs are unavailable', async () => {
    const style = { ...INITIAL_STYLE, pageSetup: { ...INITIAL_STYLE.pageSetup!, orientation:'landscape' as const } };
    const candidates = buildPageReductionCandidates(products,style);
    const result = await selectPageReduction(candidates,4,async c=>c.columnChange && c.style.categoryColumnCount===2 && c.style.columnCount===3 ? 1 : Infinity,new AbortController().signal);
    assert.equal(result?.style.categoryColumnCount,2);assert.equal(result?.style.columnCount,3);
    const exhausted = await selectPageReductionAlternative(products,style,{...candidates[0],style:{...style,categoryColumnCount:4,columnCount:5},pageCount:1},4,
      async()=>{throw new Error('No larger columns should be attempted');},new AbortController().signal);
    assert.equal(exhausted,null);
});


test('portrait proposals stop at two category and two product columns, preserving existing higher settings',()=>{
  assert.deepEqual(getPageReductionColumnOptions(INITIAL_STYLE),[{categories:2,products:1},{categories:2,products:2}]);
  const existing={...INITIAL_STYLE,columnCount:3 as const,categoryColumnCount:3 as const};
  assert.ok(buildPageReductionCandidates(products,existing).every(c=>c.style.columnCount>=3 && c.style.categoryColumnCount!>=3));
  assert.ok(!getPageReductionColumnOptions(existing).some(c=>c.products>3 || c.categories>3));
});
test('portrait alternative starts with exactly 2 by 2 and searches for one page even if the first result only fits two',async()=>{
 const first={...buildPageReductionCandidates(products,INITIAL_STYLE)[0],pageCount:2};
 const reads:number[]=[];
 const second=await selectPageReductionAlternative(products,INITIAL_STYLE,first,3,async candidate=>{
  assert.equal(candidate.style.categoryColumnCount,2);assert.equal(candidate.style.columnCount,2);
  reads.push(candidate.style.elementStyles.productName.fontSize||0);
  return candidate.stage==='fonts'||candidate.stage==='margins'?1:2;
 },new AbortController().signal);
 assert.equal(second?.pageCount,1);assert.ok(reads.length>1);
});
test('a two-page result with 2 by 2 columns is rechecked with columns first to find a possible single page',async()=>{
 const first={...buildPageReductionCandidates(products,INITIAL_STYLE,{categories:2,products:2})[0],pageCount:2};
 const second=await selectPageReductionAlternative(products,INITIAL_STYLE,first,3,async c=>c.stage==='fonts'?1:2,new AbortController().signal);
 assert.equal(second?.pageCount,1);
 const duplicate=await selectPageReductionAlternative(products,INITIAL_STYLE,first,3,async()=>2,new AbortController().signal);
 assert.equal(duplicate,null);
});
