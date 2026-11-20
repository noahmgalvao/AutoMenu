import { useContext, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { canvasShapeKinds, canvasShapeUrl } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind, miniFoodIconUrl, MINI_FOODS, type MiniFoodKind } from '../../../domain/menu/miniFoods';
import type { CustomMenuMarker, MenuMarker } from '../../../domain/menu/model';
import { CustomMarkerLibrary, useLoadCustomMarkerLibrary } from './CustomMarkerLibrary';
import { MiniFoodChoices } from './MiniFoodChoices';
import { DesignerOptionSelect } from './SearchableSelects';
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

export function MarkerControls({ label, color, marker, onChange, onRemove }: {
  label: string;
  color: string;
  marker: MenuMarker;
  onChange: (marker: MenuMarker) => void;
  onRemove: (id: string) => void;
}) {
  const library = useContext(CustomMarkerLibrary);
  useLoadCustomMarkerLibrary(library);
  const [submenu, setSubmenu] = useState<'mini-food' | 'create' | null>(null);
  const selectedFood = typeof marker === 'string' && isMiniFoodKind(marker) ? marker : undefined;
  const selectedCustom = typeof marker === 'object' ? marker : undefined;
  const saved = library?.markers.find(item => item.id === selectedCustom?.id);
  const value = submenu || (selectedFood ? 'mini-food' : selectedCustom ? selectedCustom.id : String(marker));
  const options = [
    ...standardMarkers.map(([value, name, glyph]) => ({ value, label: `${glyph} ${name}` })),
    { value: 'mini-food', label: selectedFood ? `Mini comidas · ${MINI_FOODS.find(food => food.kind === selectedFood)?.name}` : 'Mini comidas' },
    ...(selectedCustom && !saved ? [{ value: selectedCustom.id, label: 'Marcador deste cardápio', disabled: true }] : []),
    ...(library?.markers.map(({ id, shape }, index) => ({ value: id, label: `Marcador ${index + 1} · ${canvasShapeKinds.find(([kind]) => kind === shape.kind)?.[1]
      || MINI_FOODS.find(food => food.kind === shape.kind)?.name || 'Forma'}` })) || []),
    ...(library ? [{ value: 'create', label: 'Personalizado', disabled: !library.ready }] : []),
  ];

  return <div className="space-y-2">
    <DesignerOptionSelect label={label} value={value} options={options}
      onChange={key => {
        if (key === 'mini-food' || key === 'create') {
          setSubmenu(key);
          return;
        }
        setSubmenu(null);
        const custom = library?.markers.find(item => item.id === key);
        const standard = standardMarkers.find(([id]) => id === key);
        if (custom) onChange(custom);
        else if (standard) onChange(standard[0]);
      }} />
    {submenu === 'mini-food' && <MiniFoodChoices selected={selectedFood} choose={kind => {
      onChange(kind);
      setSubmenu(null);
    }} />}
    {selectedFood && !submenu && <button type="button" onClick={() => setSubmenu('mini-food')}
      className="flex min-h-8 items-center gap-1.5 rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
      <img src={miniFoodIconUrl(selectedFood)} alt="" width={19} height={19} />
      Trocar mini comida
    </button>}
    {submenu === 'create' && library && <ShapeEditor color={color} saveLabel="Salvar marcador" disabled={!library.ready} onSave={shape => {
      const next = { id: crypto.randomUUID(), shape };
      if (!library.save(next)) return;
      onChange(next);
      setSubmenu(null);
    }} />}
    {saved && !submenu && <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1">
      <img src={canvasShapeUrl(saved.shape)} alt="Prévia do marcador" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
      <button type="button" onClick={() => library?.remove(saved.id, () => onRemove(saved.id))}
        className="flex min-h-8 items-center gap-1 text-xs font-semibold text-red-700 disabled:opacity-50">
        <Trash2 size={14} aria-hidden="true" /> Remover marcador da lista
      </button>
    </div>}
  </div>;
}
