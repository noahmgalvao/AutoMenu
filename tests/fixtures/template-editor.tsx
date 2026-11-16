import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MenuDesigner from '../../components/MenuDesigner';
import { PRESET_TEMPLATES } from '../../utils/templateCatalog';
import type { MenuStyle, Product, SortOption } from '../../types';
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

function Fixture() {
  const [history, setHistory] = useState([initial]);
  const style = history[history.length - 1];
  const [sortOption, setSortOption] = useState<SortOption>({ field:'name', direction:'asc' });
  return <>
    <output hidden data-testid="editor-state" data-edits={history.length - 1} data-applied={style.appliedTemplateId || style.id} />
    <MenuDesigner style={style} setStyle={(patch) =>
      setHistory((current) => [...current, typeof patch === 'function' ? patch(current[current.length - 1]) : patch])
    } products={products} sortOption={sortOption} setSortOption={setSortOption}
      templates={[...PRESET_TEMPLATES, imported]} workspaceId="test-workspace" currentUserId="test-user"
      undo={() => setHistory((current) => current.length > 1 ? current.slice(0, -1) : current)}
      canUndo={history.length > 1} splitCategoryAcrossPages />
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
