import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browserServices } from '../../src/composition/browserServices';
import { AppServicesProvider } from '../../src/presentation/app/AppServicesProvider';
import MenuDesigner from '../../src/presentation/menu/MenuDesigner';
import { ProductDesigner } from '../../src/presentation/products/ProductDesigner';
import { MenuPreview } from '../../src/presentation/menu/canvas/MenuPreview';
import { PRESET_TEMPLATES } from '../../src/domain/templates/templateCatalog';
import { canvasShapeUrl, createCanvasShape } from '../../src/domain/menu/canvasShapes';
import type { MenuStyle, Product, SortOption } from '../../src/domain/menu/model';
import type { TemplateDesign } from '../../src/domain/templates/model';
import '../../src/presentation/styles.css';

const initial = { ...PRESET_TEMPLATES[0], menuTitle: 'Casa São Bento', menuSubtitle: 'Cozinha de estação' };
const imported: MenuStyle = {
  ...initial, id: 'imported-1', name: 'Café da Vó', scope: 'workspace',
  sourceType: 'ai_import', templateVersionId: 'original-version', catalogMetadata: undefined, design: undefined,
};
const products: Product[] = [
  {id:'1', category:'Entradas', name:'Burrata da casa', price:34, description:'Com pão e tomatinhos assados.'},
  {id:'2', category:'Principais', name:'Risoto de abóbora', price:59, description:'Manteiga de sálvia e queijo curado.'},
  {id:'3', category:'Sobremesas', name:'Tarte de maçã', price:24, description:'Massa crocante e baunilha.'},
];
const samplePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=';
const batchShapes = [
  { id: 'shape-left', x: 115, shape: { ...createCanvasShape('rectangle', '#4f46e5'), rotation: 25, corners: 12 } },
  { id: 'shape-right', x: 325, shape: createCanvasShape('star', '#dc2626') },
  { id: 'shape-other', x: 520, shape: createCanvasShape('rectangle', '#15803d') },
];

function Fixture() {
  const params = new URLSearchParams(location.search);
  const photoMode = params.get('photos');
  const defaultFields = params.has('default-fields');
  const priceFlow = params.has('price-flow');
  const splitCategory = params.has('split-category');
  const batchLayers = params.has('batch-layers');
  const [history, setHistory] = useState<MenuStyle[]>(() => !photoMode ? [
    batchLayers ? {
      ...initial,
      addedImages: [
        ...batchShapes.map(shape => ({
          ...shape, y: 475, width: 100, url: canvasShapeUrl(shape.shape), pageIndex: 0, backgroundPromptDismissed: true,
        })),
        { id: 'batch-photo', x: 325, y: 640, width: 100, url: samplePhoto, pageIndex: 0, backgroundPromptDismissed: true },
      ],
      blankPages: [{ id: 'layers-page', index: 1, fixedPosition: true }],
    } : params.has('added-image') ? {
      ...initial, addedImages: [
        { id: 'sample-image', url: samplePhoto, x: 290, y: 360, width: 128, pageIndex: 0 },
        ...(params.has('image-pair') ? [{ id: 'second-image', url: samplePhoto, x: 470, y: 460, width: 128, pageIndex: 0 }] : []),
      ],
    } : initial,
  ] : [{
    ...initial, showImages: !splitCategory && !priceFlow,
    ...(priceFlow ? {
      productDividerStyle: 'dashed',
      elementStyles: {
        ...initial.elementStyles,
        productName: { fontFamily: 'Arial', fontSize: 20 },
        productPrice: { fontFamily: 'Arial', fontSize: 28 },
      },
    } : {}),
    ...(params.has('formatting-sample') ? {
      markers: { category: 'diamond', product: 'none' },
      categoryDividerStyles: { Entradas: 'dotted' },
      borders: {
        category: { sides: ['left'], color: '#dc2626', thickness: 3, length: 100, radius: 0, offset: 0, pattern: 'dashed' },
      },
    } : {}),
    layoutMode: photoMode === 'list' ? 'list' : 'cards',
    columnCount: photoMode === 'list' || params.get('cols') === '1' ? 1 : params.get('cols') === '2' ? 2 : 3,
    categoryColumnCount: params.get('lanes') === '3' ? 3 : params.get('lanes') === '2' ? 2 : initial.categoryColumnCount,
    categoryPlacements: params.has('right-column') ? { Entradas: { pageIndex: 0, columnIndex: 0 }, Sobremesas: { pageIndex: 0, columnIndex: 1 } } : initial.categoryPlacements,
    pageSetup: params.has('landscape') ? { ...initial.pageSetup!, orientation: 'landscape' } : initial.pageSetup,
    design: splitCategory ? undefined : {
      ...initial.design!,
      card: (params.get('card') as TemplateDesign['card']) || 'flat',
      image: photoMode === 'background' ? 'background' : 'top',
    },
  }]);
  const [items, setItems] = useState(() => splitCategory ? [
    { id: 'a1', category: 'A', name: 'A1', price: 12, description: '', customMarginTop: 350 },
    ...[1, 2, 3].map(index => ({ id: `b${index}`, category: 'B', name: `B${index}`, price: 12, description: '', customMarginTop: 190 })),
    { id: 'c1', category: 'C', name: 'C1', price: 12, description: '', customMarginTop: 130 },
  ] : params.has('dense-list') ? Array.from({ length: 22 }, (_, i) => ({
    id: `side-${i + 1}`, category: 'Acompanhamentos', name: i === 0 ? 'Batata Trufada' : `Novo item ${i}`,
    description: 'Descrição', price: 6.5,
  })) : !photoMode ? products : (params.has('single-product') ? products.slice(0, 1) : products).map(product => ({
    ...product,
    name: defaultFields ? 'Novo item' : params.has('long-name') && product.id === '1' ? 'Burratacomtomatemarinado'.repeat(4) : product.name,
    description: defaultFields ? 'Descrição' : product.description,
    price: params.has('zero-price') && product.id === '1' ? 0 : product.price,
    category: defaultFields ? 'Nova categoria 12' : params.has('different-categories') && product.id === '3' ? product.category : 'Entradas', image: samplePhoto,
  })));
  const [future, setFuture] = useState<MenuStyle[]>([]);
  const editSession = useRef(0);
  const currentSession = useRef(0);
  const actions = useRef<number[]>([]);
  const futureActions = useRef<number[]>([]);
  const handleEditChange = useCallback((id: string | null) => {
    currentSession.current = id ? ++editSession.current : 0;
  }, []);
  const style = history[history.length - 1];
  const [sortOption, setSortOption] = useState<SortOption>({ field:'name', direction:'asc' });
  if (params.has('product-designer')) return <main className="flex h-screen items-start">
    <ProductDesigner products={items} setProducts={setItems} style={style} setStyle={(patch) => setHistory(current => [...current,
      typeof patch === 'function' ? patch(current[current.length - 1]) : patch])} sortOption={sortOption}
      workspaceId="test-workspace" currentUserId="test-user" currentMenuId="test-menu" />
    <button type="button" className="mt-24" onClick={() => setSortOption({ field: 'name', direction: 'desc' })}>Ordenar produtos</button>
  </main>;
  return <>
    <output hidden data-testid="editor-state" data-edits={history.length - 1} data-applied={style.appliedTemplateId || style.id} />
    <MenuDesigner style={style} setStyle={(patch) => {
      actions.current.push(currentSession.current);
      futureActions.current = [];
      setFuture([]);
      setHistory((current) => [...current, typeof patch === 'function' ? patch(current[current.length - 1]) : patch]);
    }} products={items} setProducts={photoMode ? setItems : undefined} sortOption={sortOption} setSortOption={setSortOption}
      templates={[...PRESET_TEMPLATES, imported]} workspaceId="test-workspace" currentUserId="test-user"
      onProductEditChange={handleEditChange}
      undo={() => {
        if (history.length < 2) return;
        const action = actions.current.pop() || 0;
        if (currentSession.current && action !== currentSession.current) document.dispatchEvent(new Event('automenu:close-product-editor'));
        futureActions.current.unshift(action);
        setFuture(current => [style, ...current]);
        setHistory(current => current.slice(0, -1));
      }}
      redo={() => {
        if (!future.length) return;
        const action = futureActions.current.shift() || 0;
        if (currentSession.current && action !== currentSession.current) document.dispatchEvent(new Event('automenu:close-product-editor'));
        actions.current.push(action);
        setHistory(current => [...current, future[0]]);
        setFuture(current => current.slice(1));
      }}
      canUndo={history.length > 1} canRedo={future.length > 0} splitCategoryAcrossPages />
  </>;
}

function LayoutFixture({ categories, adjacent, productsInCategory, closeTexts, topText, layer }: {
  categories: boolean; adjacent: boolean; productsInCategory: boolean; closeTexts: boolean; topText?: 'detached' | 'attached';
  layer?: 'image' | 'shape';
}) {
  const [style, setStyle] = useState<MenuStyle>((): MenuStyle => {
    const shape = layer === 'shape' ? createCanvasShape('rectangle', '#4f46e5') : undefined;
    return {
      ...initial, categoryColumnCount: 2,
      addedImages: layer ? [{ id: 'test-layer', url: shape ? canvasShapeUrl(shape) : samplePhoto, shape, x: 105, y: 410, width: 128, pageIndex: 0 }] : undefined,
      customCategoryOrder: categories ? ['Principais', 'Sobremesas', 'Entradas'] : topText === 'detached'
        ? ['ft_zone_a', 'Entradas'] : ['Entradas', 'ft_zone_a', 'ft_zone_b'],
      customProductOrder: topText === 'attached' ? { Entradas: ['text-a', '1'] } : undefined,
      categoryPositions: categories ? {
        Principais: { pageIndex: 0, columnIndex: 1, y: 210 },
        Sobremesas: { pageIndex: 0, columnIndex: 1, y: adjacent ? 330 : 690 },
        Entradas: { pageIndex: 0, columnIndex: 0, y: 210 },
      } : topText ? {
        Entradas: { pageIndex: 0, columnIndex: 0, y: topText === 'detached' ? 245 : 0 },
        ...(topText === 'detached' ? { ft_zone_a: { pageIndex: 0, columnIndex: 0, x: 30, y: 175 } } : {}),
      } : {
        ft_zone_a: { pageIndex: 0, columnIndex: 1, x: 20, y: 220 },
        ft_zone_b: { pageIndex: 0, columnIndex: 1, x: 20, y: closeTexts ? 259 : 310 },
      },
    };
  });
  const [items, setItems] = useState<Product[]>(categories ? products : [
    ...(productsInCategory ? products.map(product => ({ ...product, category: 'Entradas' })) : [products[0]]),
    { id: 'text-a', category: topText === 'attached' ? 'Entradas' : 'ft_zone_a', name: 'A', description: '', price: 0, isFreeText: true, freeTextWidth: 44 },
    ...(productsInCategory || topText ? [] : [
      { id: 'text-b', category: 'ft_zone_b', name: 'B', description: '', price: 0, isFreeText: true, freeTextWidth: 44 },
    ]),
  ]);
  return <main data-automenu-editor-canvas="true" style={{ maxHeight: '100vh', overflow: 'auto' }}>
    <MenuPreview products={items} style={style} sortOption={{ field:'name', direction:'asc' }}
      onStyleUpdate={setStyle}
      onAddProduct={(category, _productId, isFreeText, id, initialData) => {
        if (!id) return;
        setItems(current => [...current, { id, category, name: '', description: '', price: 0, isFreeText, ...initialData }]);
      }}
      onCommitCategoryOrder={(customCategoryOrder) => setStyle((current) => ({ ...current, customCategoryOrder }))}
      onDeleteProduct={(id) => setItems((current) => current.filter((item) => item.id !== id))}
      onUpdateProducts={(updates) => setItems((current) => current.map((item) => updates.reduce((result, update) => (
        update.id === item.id ? { ...result, [update.field]: update.value } : result
      ), item)))}
    />
  </main>;
}

const params = new URLSearchParams(location.search);
const layout = params.get('layout');
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <AppServicesProvider services={browserServices}>
    {layout !== null ? <LayoutFixture categories={layout === 'categories'} adjacent={params.has('adjacent')} productsInCategory={layout === 'products'} closeTexts={layout === 'borders'}
      layer={params.has('shape') ? 'shape' : params.has('image') ? 'image' : undefined}
      topText={layout === 'top-detached' ? 'detached' : layout === 'top-attached' ? 'attached' : undefined} /> : <Fixture />}
  </AppServicesProvider>
</React.StrictMode>);
