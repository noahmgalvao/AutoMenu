import { useContext, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { canvasShapeKinds, canvasShapeUrl } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind, miniFoodIconUrl, MINI_FOODS, type MiniFoodKind } from '../../../domain/menu/miniFoods';
import type { CustomMenuMarker, MenuMarker } from '../../../domain/menu/model';
import { CustomMarkerLibrary, useLoadCustomMarkerLibrary } from './CustomMarkerLibrary';
import { MiniFoodChoices } from './MiniFoodChoices';
import { ShapeEditor } from './ShapePicker';

export const standardMarkers: [Exclude<MenuMarker, CustomMenuMarker | MiniFoodKind>, string, string][] = [
  ['none', 'Sem marcador', '—'],
  ['dot', 'Ponto', '•'],
  ['circle', 'Círculo', '○'],
  ['diamond', 'Losango', '◆'],
  ['arrow', 'Seta', '→'],
  ['check', 'Visto', '✓'],
  ['dash', 'Traço', '–'],
  ['number', 'Número com ponto', '1.'],
  ['number-circle', 'Número em círculo', '①'],
  ['number-square', 'Número em quadrado', '1'],
  ['number-padded', 'Número com zero', '01'],
];

export function MarkerControls({ label, color, marker, onChange, onRevert, onRemove }: {
  label: string;
  color: string;
  marker: MenuMarker;
  onChange: (marker: MenuMarker) => void;
  onRevert: (id: string, fallback: MenuMarker) => void;
  onRemove: (id: string) => void;
}) {
  const library = useContext(CustomMarkerLibrary);
  useLoadCustomMarkerLibrary(library);
  const [submenu, setSubmenu] = useState<'mini-food' | 'create' | null>(null);
  const selectedFood = typeof marker === 'string' && isMiniFoodKind(marker) ? marker : undefined;
  const selectedCustom = typeof marker === 'object' ? marker : undefined;
  const saved = library?.markers.find(item => item.id === selectedCustom?.id);
  const value = submenu || (selectedFood ? 'mini-food' : selectedCustom ? selectedCustom.id : String(marker));

  return <div className="space-y-2">
    <select aria-label={label} value={value} className="h-8 w-full rounded-md border border-slate-200 bg-white px-1 text-xs"
      onChange={event => {
        const key = event.currentTarget.value;
        if (key === 'mini-food' || key === 'create') {
          setSubmenu(key);
          return;
        }
        setSubmenu(null);
        const custom = library?.markers.find(item => item.id === key);
        const standard = standardMarkers.find(([id]) => id === key);
        if (custom) onChange(custom);
        else if (standard) onChange(standard[0]);
      }}>
      {standardMarkers.map(([key, name, glyph]) => <option key={key} value={key}>{glyph} {name}</option>)}
      <option value="mini-food">
        Mini comidas{selectedFood && ` · ${MINI_FOODS.find(food => food.kind === selectedFood)?.name}`}
      </option>
      {selectedCustom && !saved && <option value={selectedCustom.id} disabled>Marcador deste cardápio</option>}
      {library?.markers.map(({ id, shape }, index) => <option key={id} value={id}>
        {`Marcador ${index + 1} · ${canvasShapeKinds.find(([kind]) => kind === shape.kind)?.[1]
          || MINI_FOODS.find(food => food.kind === shape.kind)?.name || 'Forma'}`}
      </option>)}
      {library && <option value="create" disabled={!library.ready}>Personalizado</option>}
    </select>
    {submenu === 'mini-food' && <MiniFoodChoices selected={selectedFood} choose={kind => {
      onChange(kind);
      setSubmenu(null);
    }} />}
    {selectedFood && !submenu && <button type="button" onClick={() => setSubmenu('mini-food')}
      className="flex min-h-8 items-center gap-1.5 rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
      <img src={miniFoodIconUrl(selectedFood)} alt="" width={19} height={19} />
      Trocar mini comida
    </button>}
    {submenu === 'create' && library && <ShapeEditor color={color} saveLabel="Salvar marcador" disabled={library.pending} onSave={shape => {
      const next = { id: crypto.randomUUID(), shape };
      if (!library.save(next, () => onRevert(next.id, marker))) return;
      onChange(next);
      setSubmenu(null);
    }} />}
    {saved && !submenu && <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1">
      <img src={canvasShapeUrl(saved.shape)} alt="Prévia do marcador" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
      <button type="button" disabled={library?.pending} onClick={() => library?.remove(saved.id, () => onRemove(saved.id))}
        className="flex min-h-8 items-center gap-1 text-xs font-semibold text-red-700 disabled:opacity-50">
        <Trash2 size={14} aria-hidden="true" /> Remover marcador da lista
      </button>
    </div>}
    {library?.error && <div role="alert" className="text-xs text-red-700">
      {library.error}
      {!library.ready && <button type="button" onClick={library.load} className="ml-1 font-semibold underline">Tentar novamente</button>}
    </div>}
  </div>;
}
