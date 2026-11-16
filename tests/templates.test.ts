import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESET_TEMPLATES, LEGACY_TEMPLATE_IDS } from '../utils/templateCatalog';
import { applyTemplateToCurrentStyle, getAppliedTemplateId } from '../utils/templateApplication';
import { filterTemplates, stepTemplate, swipeDirection } from '../utils/templateBrowse';
import { normalizeMenuPageSetup, resolveMenuPageDimensions } from '../utils/pageSetup';
import { calculatePagination, finalizeMenuPages } from '../utils/menuPagination';
import { getPaperDimensionsMm, getPrintFrameSizeMm, type PdfPrintOptions } from '../utils/pdfExport';
import { settleFavorite, visibleFavorites, isPermanentFavoriteError } from '../services/templateCatalogService';
import { normalizeTemplateDesign } from '../utils/templateDesign';
import type { Product } from '../types';

test('50 canonical designs have distinct composition and complete metadata', () => {
  assert.equal(PRESET_TEMPLATES.length, 50);
  assert.equal(new Set(PRESET_TEMPLATES.map(({id}) => id)).size, 50);
  const compositions = PRESET_TEMPLATES.map(({design, pageSetup, columnCount, categoryColumnCount}) =>
    JSON.stringify({design, pageSetup, columnCount, categoryColumnCount}));
  assert.equal(new Set(compositions).size, 50);
  for (const [index, template] of PRESET_TEMPLATES.entries()) {
    assert.ok(template.catalogMetadata?.description);
    assert.equal(template.catalogMetadata.sortOrder, index + 1);
    assert.equal(template.catalogMetadata.orientation, template.pageSetup?.orientation);
    assert.ok(normalizeTemplateDesign(template.design));
  }
  for (const [former, canonical] of LEGACY_TEMPLATE_IDS) {
    assert.ok(!PRESET_TEMPLATES.some((template) => template.id === former));
    assert.ok(PRESET_TEMPLATES.some((template) => template.id === canonical));
  }
});

test('applying a design preserves imported data, visibility and positions of user assets safely', () => {
  const imported = {
    ...PRESET_TEMPLATES[0], id: 'ai-import', scope: 'workspace' as const, sourceType: 'ai_import' as const,
    sourceImage: '/reference.png', sourceAssetId: 'reference', menuTitle: 'Cantina São João', menuSubtitle: 'Desde 1992',
    customCategoryOrder: ['Massas'], customProductOrder: { Massas: ['P'] }, hiddenProductIds: ['P'],
    addedImages: [{id: 'logo', url: '/logo.png', assetId: 'asset', x: 745, y: 1000, width: 180, pageIndex: 4}],
    pageBackgrounds: [{pageIndex: 4, url: '/paper.jpg', assetId: 'paper'}],
    floatingText: [{id: 'note', text: 'Texto original', x: 720, y: 980, pageIndex: 0}],
    blankPages: [{id: 'saved', index: 4}],
    categoryPlacements: {Massas: {pageIndex: 0, columnIndex: 2}},
    pageBreaks: ['Massas'],
  };
  const before = structuredClone(imported);
  const template = PRESET_TEMPLATES.find(({id}) => id === 'menu-board')!;
  const originalTemplate = structuredClone(template);
  const result = applyTemplateToCurrentStyle(imported, template);
  assert.deepEqual(imported, before);
  assert.deepEqual(template, originalTemplate);
  for (const field of ['id', 'sourceAssetId', 'sourceImage', 'menuTitle', 'menuSubtitle', 'customCategoryOrder',
    'customProductOrder', 'hiddenProductIds', 'pageBackgrounds', 'blankPages', 'pageBreaks'] as const) {
    assert.deepEqual(result[field], imported[field], field);
  }
  assert.equal(result.addedImages?.[0].assetId, 'asset');
  assert.equal(result.floatingText?.[0].text, 'Texto original');
  assert.equal(result.categoryPlacements, undefined);
  assert.equal(getAppliedTemplateId(result), template.id);
  assert.equal(getAppliedTemplateId({...result, appliedTemplateId: undefined, id: 'modern-clean'}), 'moderno-limpo');
  const {widthPx, heightPx} = resolveMenuPageDimensions(result);
  assert.ok(result.addedImages![0].x + result.addedImages![0].width <= widthPx);
  assert.ok(result.addedImages![0].y < heightPx);
});

test('filters include import scope, favorites and accent-insensitive metadata search', () => {
  const imported = {...PRESET_TEMPLATES[0], id: 'mine', name: 'Pão da Vó', scope: 'workspace' as const};
  const all = [...PRESET_TEMPLATES, imported];
  const favorites = new Set([imported.id, 'patisserie-rose']);
  assert.equal(filterTemplates(all,'all','',favorites).length, 51);
  assert.deepEqual(filterTemplates(all,'mine','pao da vo',favorites).map(({id})=>id), ['mine']);
  assert.deepEqual(filterTemplates(all,'favorites','PÂTISSERIE Rose',favorites).map(({id})=>id), ['patisserie-rose']);
  assert.equal(filterTemplates(all,'all','editorial paisagem',favorites).length > 0, true);
});

test('arrow and swipe navigation clamp to the filtered results', () => {
  assert.equal(stepTemplate([], undefined, 1), undefined);
  assert.equal(stepTemplate(PRESET_TEMPLATES, 'moderno-limpo', -1), 'moderno-limpo');
  assert.equal(stepTemplate(PRESET_TEMPLATES, 'moderno-limpo', 1), 'swiss-grid');
  assert.equal(stepTemplate(PRESET_TEMPLATES, 'landscape-premium', 1), 'landscape-premium');
  assert.equal(swipeDirection(5,-90),1);
  assert.equal(swipeDirection(0,90),-1);
  assert.equal(swipeDirection(100,60),0);
  assert.equal(swipeDirection(0,20),0);
});

test('favorite queue persists refresh state and rolls back only the request that failed', () => {
  let cache = {confirmed: ['a'], pending: {a: false, b: true}};
  assert.deepEqual([...visibleFavorites(cache)], ['b']);
  const olderRequest = settleFavorite(cache, 'a', true, true);
  assert.equal(olderRequest.pending.a, false);
  assert.deepEqual([...visibleFavorites(olderRequest)], ['b']);
  const rolledBack = settleFavorite(olderRequest, 'a', false, false);
  assert.deepEqual([...visibleFavorites(rolledBack)], ['a', 'b']);
  assert.deepEqual(settleFavorite(rolledBack, 'b', true, true), {confirmed:['a','b'],pending:{}});
  assert.ok(isPermanentFavoriteError({code:'42501'}));
  assert.ok(!isPermanentFavoriteError({code:'503'}));
});

test('legacy, preset, custom and display units are consistent with PDF paper and frame', () => {
  const {widthPx, heightPx} = resolveMenuPageDimensions();
  assert.deepEqual([widthPx,heightPx], [794,1123]);
  assert.equal(normalizeMenuPageSetup({preset:'custom',orientation:'portrait',widthMm:1,heightMm:1200}).widthMm,50);
  assert.equal(normalizeMenuPageSetup({preset:'custom',orientation:'portrait',widthMm:1,heightMm:1200}).heightMm,1000);
  for (const template of PRESET_TEMPLATES) {
    const dim = resolveMenuPageDimensions(template);
    const options = {paperSize:dim.setup.preset === 'screen' ? 'custom' : dim.setup.preset,
      orientation:dim.setup.orientation, customPaperWidthMm:dim.setup.widthMm,
      customPaperHeightMm:dim.setup.heightMm, scaleMode:'actual'} as PdfPrintOptions;
    const expected = {width:dim.widthMm,height:dim.heightMm};
    assert.deepEqual(getPaperDimensionsMm(options),expected);
    assert.deepEqual(getPrintFrameSizeMm(options, expected,0,{width:dim.widthPx,height:dim.heightPx,widthMm:dim.widthMm,heightMm:dim.heightMm}),expected);
  }
});

test('all designs paginate short, medium and long menus without losing products', () => {
  for (const style of PRESET_TEMPLATES) {
    for (const count of [3, 19, 65]) {
      const groups: Record<string, Product[]> = {};
      const products = Array.from({length:count},(_, i) => {
        const category = 'Categoria ' + Math.floor(i/6);
        const product: Product = {
          id: 'p'+i, category, name: i % 2 ? 'Especial da casa com acompanhamentos' : 'Prato do dia',
          description: 'Preparado com ingredientes frescos da estação. '.repeat(1 + i % 5),
          price: 10 + i, image: i % 2 ? '/test.png' : undefined,
        };
        (groups[category] ??= []).push(product);
        return product;
      });
      const pages = calculatePagination(products, style, groups, Object.keys(groups), null, {splitCategoryAcrossPages:true});
      const ids = pages.flatMap((page) => page.flatItems.flatMap((item) =>
        item.type === 'product-item' ? [item.data.id] : item.type === 'product-row' ? item.data.map((p) => p.id) : []));
      assert.deepEqual(ids.sort(), products.map(({id}) => id).sort(), style.name);
    }
  }
  const pages = finalizeMenuPages([], {...PRESET_TEMPLATES[0],
    addedImages:[{id:'1',url:'/logo',x:0,y:0,width:10,pageIndex:7}]});
  assert.equal(pages.length,8);
});
