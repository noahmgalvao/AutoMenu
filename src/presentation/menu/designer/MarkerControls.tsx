import { MenuMarkerGlyph, standardMarkers } from '../canvas/MenuMarkerGlyph';
import { useContext, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { canvasShapeKinds, createCanvasShape } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind, miniFoodIconUrl, MINI_FOODS, MINI_FOOD_INK } from '../../../domain/menu/miniFoods';
import { contrastRatio } from '../../../domain/menu/textContrast';
import type { MenuMarker } from '../../../domain/menu/model';
import { CustomMarkerLibrary, useLoadCustomMarkerLibrary } from './CustomMarkerLibrary';
import { MiniFoodChoices } from './MiniFoodChoices';
import { DesignerPicker } from './SearchableSelects';
import { ShapeEditor } from './ShapePicker';

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
    ...standardMarkers.map(([value, label]) => ({ value, label })),
    { value: 'mini-food', label: selectedFood ? `Mini comidas · ${MINI_FOODS.find(food => food.kind === selectedFood)?.name}` : 'Mini comidas' },
    ...(selectedCustom && !saved ? [{ value: selectedCustom.id, label: 'Marcador deste cardápio', disabled: true }] : []),
    ...(library?.markers.map(({ id, shape }, index) => ({ value: id, label: `Marcador ${index + 1} · ${canvasShapeKinds.find(([kind]) => kind === shape.kind)?.[1]
      || MINI_FOODS.find(food => food.kind === shape.kind)?.name || 'Forma'}` })) || []),
    ...(library ? [{ value: 'create', label: 'Personalizado', disabled: !library.ready }] : []),
  ];

  const savedById = new Map(library?.markers.map(item => [item.id, item]));
  return <div className="space-y-2">
    <DesignerPicker compact label={label} value={options.find(option => option.value === value) || options[0]} options={options}
      render={option => {
        const preview = option.value === 'mini-food' ? selectedFood || MINI_FOODS[0].kind
          : option.value === 'create' ? { id: 'create', shape: createCanvasShape('rectangle', color) }
            : savedById.get(option.value) || (option.value === selectedCustom?.id ? selectedCustom : undefined)
              || standardMarkers.find(([key]) => key === option.value)?.[0] || 'none';
        const ink = typeof preview === 'object' ? (preview.shape.kind === 'line' ? preview.shape.stroke : preview.shape.fill)
          : isMiniFoodKind(preview) ? MINI_FOOD_INK : color;
        const darkBacking = preview !== 'none' && /^#[a-f\d]{6}$/i.test(ink)
          && contrastRatio([1, 3, 5].map(index => parseInt(ink.slice(index, index + 2), 16)) as [number, number, number], [255, 255, 255]) < 2.5;
        return <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-10 shrink-0 place-items-center border-r border-slate-300 pr-2">
            <span data-marker-preview className={`grid h-6 w-7 place-items-center rounded ${darkBacking ? 'bg-slate-800' : ''}`}>
              <MenuMarkerGlyph marker={preview} index={0} color={color} fontSize={18} preview />
            </span>
          </span>
          <span className="truncate">{option.label}</span>
        </span>;
      }}
      renderAction={option => savedById.has(option.value) && <button type="button"
        title="Remover marcador da lista" aria-label={`Remover da lista: ${option.label}`}
        className="grid size-8 shrink-0 place-items-center rounded text-red-600 hover:bg-red-50 active:bg-red-100"
        onClick={() => library?.remove(option.value, () => onRemove(option.value))}>
        <Trash2 size={16} aria-hidden="true" />
      </button>}
      choose={({ value: key }) => {
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
  </div>;
}
