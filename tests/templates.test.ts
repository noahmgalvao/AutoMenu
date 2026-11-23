import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESET_TEMPLATES, LEGACY_TEMPLATE_IDS } from '../src/domain/templates/templateCatalog';
import { applyTemplateToCurrentStyle, getAppliedTemplateId } from '../src/application/templates/templateApplication';
import { filterTemplates } from '../src/domain/templates/templateBrowse';
import { normalizeMenuPageSetup, resolveMenuPageDimensions } from '../src/domain/menu/pageSetup';
import { calculatePagination, finalizeMenuPages } from '../src/domain/menu/menuPagination';
import { getPaperDimensionsMm, getPrintFrameSizeMm, type PdfPrintOptions } from '../src/domain/publishing/printOptions';
import { settleFavorite, visibleFavorites } from '../src/application/templates/favoriteQueue';
import { isPermanentFavoriteError } from '../src/infrastructure/supabase/templateFavorites';
import { normalizeTemplateDesign } from '../src/domain/templates/templateDesign';
import type { Product } from '../src/domain/menu/model';

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
  assert.deepEqual(result.categoryPlacements, { Massas: { pageIndex: 0, columnIndex: 0 } });
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
  assert.deepEqual(filterTemplates(all,'all','',favorites).map(({id})=>id), PRESET_TEMPLATES.map(({id})=>id));
  assert.deepEqual(filterTemplates(all,'all','pao da vo',favorites), []);
  assert.deepEqual(filterTemplates(all,'mine','pao da vo',favorites).map(({id})=>id), ['mine']);
  assert.deepEqual(filterTemplates(all,'favorites','PÂTISSERIE Rose',favorites).map(({id})=>id), ['patisserie-rose']);
  assert.equal(filterTemplates(all,'all','editorial paisagem',favorites).length > 0, true);
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

test('the classic base is independent and keeps explicit neutrality across hydration', async () => {
  const { createClassicMenuStyle, INITIAL_STYLE, NO_TEMPLATE_ID } = await import('../src/domain/menu/defaults');
  const { withStyleDefaults, withMenuRuleFallback } = await import('../src/application/workspace/state');
  const draft = createClassicMenuStyle();
  assert.deepEqual([draft.fontFamily, draft.margins?.left, draft.contentSpacing?.headerToContent, draft.elementStyles.menuTitle?.fontSize],
    ['Inter', 56, 28, 44]);
  assert.deepEqual([draft.elementStyles.productPrice.color, draft.fontSizeLimits?.productDescription, draft.fontSizeLimits?.freeText],
    ['#047857', 35, 70]);
  draft.elementStyles.productPrice.color = '#000000';
  assert.equal(INITIAL_STYLE.elementStyles.productPrice.color, '#047857');
  const authored = { ...PRESET_TEMPLATES[0], menuTitle: 'Meu cardápio', menuSubtitle: 'Da casa', hiddenProductIds: ['p'],
    headingPages: { menuTitle: [0] }, productPhotoAlignments: { p: 'right' as const } };
  const neutral = withStyleDefaults(JSON.parse(JSON.stringify(applyTemplateToCurrentStyle(authored, INITIAL_STYLE))));
  assert.equal(neutral.appliedTemplateId, null);
  assert.equal(getAppliedTemplateId(neutral), NO_TEMPLATE_ID);
  assert.equal(neutral.design, undefined);
  assert.equal(neutral.menuTitle, 'Meu cardápio');
  assert.equal(neutral.menuSubtitle, 'Da casa');
  assert.deepEqual(neutral.headingPages, { menuTitle: [0] });
  assert.deepEqual(neutral.productPhotoAlignments, { p: 'right' });
  const legacy = withStyleDefaults({ ...authored, splitCategoryAcrossPages: undefined, productsCanChangeCategory: false });
  const effective = withMenuRuleFallback(legacy, { splitCategoryAcrossPages: true, productsCanChangeCategory: true });
  assert.equal(effective.splitCategoryAcrossPages, true);
  assert.equal(effective.productsCanChangeCategory, false);
  assert.equal(neutral.splitCategoryAcrossPages, false);
  assert.deepEqual(filterTemplates([INITIAL_STYLE, ...PRESET_TEMPLATES], 'all', 'padrão em branco', new Set()).map(x => x.id), [NO_TEMPLATE_ID]);
});

test('workspace templates snapshot the live design without source object IDs', async () => {
  const { createWorkspaceTemplate } = await import('../src/application/templates/portableTemplateStyle');
  const { createCanvasShape } = await import('../src/domain/menu/canvasShapes');
  const original = { ...PRESET_TEMPLATES[0], menuTitle: 'Segredo', menuSubtitle: 'Outro texto', showPrices: false,
    splitCategoryAcrossPages: true, productsCanChangeCategory: false, hiddenProductIds: ['original'],
    productPhotoAlignments: { original: 'left' as const }, categoryImages: { Segredo: { url: '/secret.jpg' } },
    textContrastFills: { 'freeText:original': '#000000', productName: '#ffffff' },
    sourceImage: '/source.jpg', addedImages: [
      { id: 'decoration', url: '/shape.svg', x: 10, y: 20, width: 42, pageIndex: 0,
        repeatAsBackground: true, shape: { ...createCanvasShape('star', '#222222'), text: 'Segredo' } },
    ] };
  const saved = createWorkspaceTemplate(original, ' Menu novo ', '  ', ' ', 'fresh-id');
  assert.equal(saved.name, 'Modelo de Menu novo');
  assert.equal(saved.templateDescription, undefined);
  assert.equal(saved.sourceType, 'user');
  assert.equal(saved.scope, 'workspace');
  assert.equal(saved.menuTitle, '');
  assert.equal(saved.templateDecoration?.[0]?.shape.text, undefined);
  assert.ok(!JSON.stringify(saved).includes('Segredo'));
  assert.ok(!JSON.stringify(saved).includes('original'));
  assert.equal(saved.addedImages, undefined);
  const other = { ...PRESET_TEMPLATES[1], menuTitle: 'Destino', hiddenProductIds: ['other'], showPrices: true,
    productPhotoAlignments: { other: 'center' as const }, productsCanChangeCategory: true,
    textContrastFills: { 'freeText:other': '#111111' } };
  const applied = applyTemplateToCurrentStyle(other, saved);
  assert.deepEqual(applied.productPhotoAlignments, other.productPhotoAlignments);
  assert.deepEqual(applied.hiddenProductIds, ['other']);
  assert.equal(applied.menuTitle, 'Destino');
  assert.equal(applied.splitCategoryAcrossPages, true);
  assert.equal(applied.productsCanChangeCategory, false);
  assert.equal(applied.showPrices, false);
  assert.deepEqual(applied.textContrastFills, { 'freeText:other': '#111111', productName: '#ffffff' });
  assert.equal(applyTemplateToCurrentStyle(applied, saved).templateDecoration?.length, 1);
});

test('Mix and individual texture size are deterministic and independent of the default color', async () => {
  const { SAMPLE_BACKGROUNDS, resolveTexture, normalizeTextureUrl } = await import('../src/domain/menu/defaults');
  const { isMiniFoodKind } = await import('../src/domain/menu/miniFoods');
  const { mixTextureToken } = await import('../src/domain/menu/textureTiles');
  assert.equal(SAMPLE_BACKGROUNDS.length, 14);
  assert.ok(!isMiniFoodKind('mini-food:mix'));
  for (const token of [mixTextureToken, 'texture:mini-food:burger']) {
    const original = resolveTexture(token);
    assert.equal(original.tiled, true);
    assert.equal(resolveTexture(token, undefined, 100).url, original.url);
    assert.notEqual(resolveTexture(token, undefined, 150).url, original.url);
  }
  assert.equal(resolveTexture('https://www.transparenttextures.com/patterns/gplay.png').tiled, false);
  assert.equal(normalizeTextureUrl('https://www.transparenttextures.com/patterns/natural-paper.png'), 'texture:natural-paper');
});

test('normal creation and the workspace recovery payload both start from the classic design', async () => {
  const { createInitialMenuVersionPayload } = await import('../src/infrastructure/supabase/workspace/menus');
  const first = createInitialMenuVersionPayload();
  const blank = createInitialMenuVersionPayload('Meu novo cardápio');
  for (const creation of [first, blank]) {
    assert.equal(creation.renderSnapshot.style.priceDecimalPlaces, 'auto');
    assert.ok(creation.renderSnapshot.products.every(product => !product.image && Number.isInteger(product.price)));
  }
  assert.equal(first.editorState.style.appliedTemplateId, null);
  assert.equal(blank.editorState.style.menuTitle, 'Meu novo cardápio');
  assert.equal(blank.editorState.style.menuSubtitle, '');
  assert.equal(blank.renderSnapshot.style.fontFamily, 'Inter');
  assert.equal(blank.renderSnapshot.products.length, first.renderSnapshot.products.length);
  const groups: Record<string, Product[]> = {};
  for (const product of blank.renderSnapshot.products) (groups[product.category] ??= []).push(product);
  assert.ok(Object.values(groups).every(products => products.length === 5));
  const pages = calculatePagination(blank.renderSnapshot.products, blank.renderSnapshot.style, groups, Object.keys(groups), null);
  assert.ok(pages[1]?.flatItems.some(item => item.type === 'product-item' || item.type === 'product-row'));
  assert.notEqual(first.editorState.style.elementStyles, blank.editorState.style.elementStyles);
});
