import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MenuDesigner from '../../components/MenuDesigner';
import { MenuPreview } from '../../components/MenuPreview';
import { PRESET_TEMPLATES } from '../../utils/templateCatalog';
import type { MenuStyle, Product, SortOption, TemplateDesign } from '../../types';
import '../../index.css';

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

function Fixture() {
  const params = new URLSearchParams(location.search);
  const photoMode = params.get('photos');
  const [history, setHistory] = useState<MenuStyle[]>(() => !photoMode ? [
    params.has('added-image') ? {
      ...initial, addedImages: [{ id: 'sample-image', url: samplePhoto, x: 290, y: 360, width: 128, pageIndex: 0 }],
    } : initial,
  ] : [{
    ...initial, showImages: true,
    layoutMode: photoMode === 'list' ? 'list' : 'cards',
    columnCount: photoMode === 'list' ? 1 : 3,
    design: {
      ...initial.design!,
      card: (params.get('card') as TemplateDesign['card']) || 'flat',
      image: photoMode === 'background' ? 'background' : 'top',
    },
  }]);
  const [items, setItems] = useState(() => !photoMode ? products : products.map(product => ({
    ...product, category: 'Entradas', image: samplePhoto,
  })));
  const style = history[history.length - 1];
  const [sortOption, setSortOption] = useState<SortOption>({ field:'name', direction:'asc' });
  return <>
    <output hidden data-testid="editor-state" data-edits={history.length - 1} data-applied={style.appliedTemplateId || style.id} />
    <MenuDesigner style={style} setStyle={(patch) =>
      setHistory((current) => [...current, typeof patch === 'function' ? patch(current[current.length - 1]) : patch])
    } products={items} setProducts={photoMode ? setItems : undefined} sortOption={sortOption} setSortOption={setSortOption}
      templates={[...PRESET_TEMPLATES, imported]} workspaceId="test-workspace" currentUserId="test-user"
      undo={() => setHistory((current) => current.length > 1 ? current.slice(0, -1) : current)}
      canUndo={history.length > 1} splitCategoryAcrossPages />
  </>;
}

function LayoutFixture({ categories, productsInCategory, closeTexts }: { categories: boolean; productsInCategory: boolean; closeTexts: boolean }) {
  const [style, setStyle] = useState<MenuStyle>({
    ...initial, categoryColumnCount: 2,
    customCategoryOrder: categories ? ['Principais', 'Sobremesas', 'Entradas'] : ['Entradas', 'ft_zone_a', 'ft_zone_b'],
    categoryPositions: categories ? {
      Principais: { pageIndex: 0, columnIndex: 1, y: 210 },
      Sobremesas: { pageIndex: 0, columnIndex: 1, y: 690 },
      Entradas: { pageIndex: 0, columnIndex: 0, y: 210 },
    } : {
      ft_zone_a: { pageIndex: 0, columnIndex: 1, x: 20, y: 220 },
      ft_zone_b: { pageIndex: 0, columnIndex: 1, x: 20, y: closeTexts ? 259 : 310 },
    },
  });
  const [items, setItems] = useState<Product[]>(categories ? products : [
    ...(productsInCategory ? products.map(product => ({ ...product, category: 'Entradas' })) : [products[0]]),
    { id: 'text-a', category: 'ft_zone_a', name: 'A', description: '', price: 0, isFreeText: true, freeTextWidth: 44 },
    ...(productsInCategory ? [] : [
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

const layout = new URLSearchParams(location.search).get('layout');
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  {layout !== null ? <LayoutFixture categories={layout === 'categories'} productsInCategory={layout === 'products'} closeTexts={layout === 'borders'} /> : <Fixture />}
</React.StrictMode>);
