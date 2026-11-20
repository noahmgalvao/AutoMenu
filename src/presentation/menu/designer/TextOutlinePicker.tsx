import type { TextOutline } from '../../../domain/menu/model';
import { DEFAULT_TEXT_OUTLINE, MAX_TEXT_OUTLINE, MIN_TEXT_OUTLINE, resolveTextOutline } from '../../../domain/menu/textOutline';
import { ColorPicker } from './ColorPicker';

export function TextOutlinePicker({ value, onChange }: {
  value?: TextOutline;
  onChange: (outline?: TextOutline) => void;
}) {
  const active = resolveTextOutline(value);
  const stroke = active || DEFAULT_TEXT_OUTLINE;
  return <ColorPicker label="Contorno do texto" value={stroke.color}
    noFill={{ label: 'Sem contorno', active: !active, onSelect: () => onChange(active ? undefined : stroke) }}
    onChange={color => onChange({ ...stroke, color })}>
    <label className="block space-y-1 font-medium text-slate-700">
      <span className="flex justify-between gap-2">
        Espessura do contorno
        <span aria-hidden="true" className="tabular-nums">{stroke.width.toLocaleString('pt-BR')} px</span>
      </span>
      <input type="range" aria-label="Espessura do contorno" min={MIN_TEXT_OUTLINE} max={MAX_TEXT_OUTLINE} step={0.25}
        value={stroke.width} onChange={event => onChange({ ...stroke, width: event.currentTarget.valueAsNumber })}
        className="block w-full accent-indigo-600" />
    </label>
  </ColorPicker>;
}
