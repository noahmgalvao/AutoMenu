import { DisclosureChevron } from '../../common/DisclosureChevron';
import React, { useState } from 'react';
import { Shapes, Utensils } from 'lucide-react';
import type { CanvasShape, CanvasShapeKind } from '../../../domain/menu/model';
import { canvasShapeKinds, canvasShapeUrl, createCanvasShape, getCanvasShapeDimensions, getCanvasShapeParameters, type CanvasShapeParameters } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind } from '../../../domain/menu/miniFoods';
import { MiniFoodChoices } from './MiniFoodChoices';
import { ColorPicker } from './ColorPicker';
import { FontSizeInput } from './FontSizeInput';

const numberFields = {
  strokeWidth: ['Espessura do contorno', 0, 12, 1],
  rotation: ['Rotação', 0, 360, 1],
  corners: ['Arredondamento', 0, 44, 1],
  points: ['Pontas', 3, 16, 1],
  innerRadius: ['Profundidade (%)', 10, 90, 1],
} as const;

export function ShapeChoices({ selected, choose }: { selected: CanvasShapeKind; choose: (kind: CanvasShapeKind) => void }) {
  const [miniFoods, setMiniFoods] = useState(false);
  const miniFood = isMiniFoodKind(selected);
  return <div className="space-y-1.5">
    <div className="grid grid-cols-4 gap-1">
      {canvasShapeKinds.map(([kind, label]) => (
        <button key={kind} type="button" aria-pressed={selected === kind} aria-label={label} title={label}
          onClick={() => { choose(kind); setMiniFoods(false); }}
          className={`grid h-10 place-items-center rounded-lg border ${selected === kind ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
          <img src={canvasShapeUrl(createCanvasShape(kind, '#4f46e5'))} alt="" className="h-6 w-7 object-contain" />
        </button>
      ))}
    </div>
    <button type="button" aria-expanded={miniFoods} onClick={() => setMiniFoods(!miniFoods)}
      className={`flex min-h-9 w-full items-center gap-2 rounded-lg border px-2 text-xs font-semibold ${miniFood ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      <Utensils size={15} aria-hidden="true" /> Mini comidas
      <DisclosureChevron open={miniFoods} size={15} className="ml-auto" />
    </button>
    {miniFoods && <MiniFoodChoices selected={miniFood ? selected : undefined} choose={kind => {
      choose(kind);
      setMiniFoods(false);
    }} />}
  </div>;
}

export function ShapeSettings({ shape, onChange, onEditEnd, onChangeShape }: {
  shape: CanvasShape;
  onChange: (patch: CanvasShapeParameters) => void;
  onEditEnd?: () => void;
  onChangeShape?: () => void;
}) {
  const changedSlider = React.useRef(false);
  const finishSlider = () => {
    if (!changedSlider.current) return;
    changedSlider.current = false;
    onEditEnd?.();
  };
  const parameters = getCanvasShapeParameters(shape);
  const fields = (Object.keys(numberFields) as (keyof typeof numberFields)[]).filter(field => field in parameters);
  const renderField = (field: keyof typeof numberFields) => {
    const [label, min, max, step] = numberFields[field];
    const fieldLabel = field === 'points' && shape.kind === 'polygon' ? 'Lados' : label;
    const change = (value: number) => {
      const next = Number((Math.round(value / step) * step).toFixed(1));
      if (next === shape[field]) return;
      changedSlider.current = true;
      onChange({ [field]: next });
    };
    return <div key={field} className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 flex-col text-[11px] font-medium text-slate-600">
        {fieldLabel}
        <input type="range" min={min} max={max} step={step} value={shape[field]}
          onChange={event => change(event.currentTarget.valueAsNumber)}
          onPointerUp={finishSlider} onPointerCancel={finishSlider} onKeyUp={finishSlider} onBlur={finishSlider}
          className="w-full accent-indigo-600" />
      </label>
      <FontSizeInput label={fieldLabel} value={shape[field]} min={min} max={max}
        onChange={change} onEditEnd={finishSlider} className="!w-14" />
    </div>;
  };
  return <div className="space-y-2">
    {onChangeShape && <button type="button" onClick={onChangeShape} className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"><Shapes size={16} />Alterar forma</button>}
    {'fill' in parameters && <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-600">
      Cor
      <ColorPicker value={shape.fill} label="Cor" onChange={fill => {
        onChange({ fill });
        onEditEnd?.();
      }} />
    </div>}
    {'stroke' in parameters && <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-600">
      Cor do contorno
      <ColorPicker value={shape.stroke} label="Cor do contorno" onChange={stroke => {
        onChange({ stroke });
        onEditEnd?.();
      }} />
    </div>}
    <div className="space-y-1">
      {fields.map(renderField)}
    </div>
  </div>;
}

export function ShapeEditor({ color, onSave, saveLabel, hidden, disabled }: {
  color: string;
  onSave: (shape: CanvasShape) => void;
  saveLabel: string;
  hidden?: boolean;
  disabled?: boolean;
}) {
  const [shape, setShape] = useState(() => createCanvasShape('rectangle', color));
  const dimensions = getCanvasShapeDimensions(shape);
  const previewScale = 48 / Math.hypot(100 * shape.ratio, 100);
  return <div hidden={hidden} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
    <ShapeChoices selected={shape.kind} choose={kind => setShape(createCanvasShape(kind, shape.fill))} />
    <div className="grid h-16 place-items-center rounded-lg bg-slate-50">
      <img src={canvasShapeUrl(shape)} alt="Prévia da forma" style={{ width: dimensions.width * previewScale, height: dimensions.height * previewScale }} />
    </div>
    <ShapeSettings shape={shape} onChange={patch => setShape(current => ({ ...current, ...patch }))} />
    <button type="button" disabled={disabled} onClick={() => onSave(shape)}
      className="w-full rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{saveLabel}</button>
  </div>;
}

export function ShapePicker({ color, onAdd }: { color: string; onAdd: (shape: CanvasShape) => void }) {
  return <div className="col-span-2">
    <button type="button" onClick={() => onAdd(createCanvasShape('rectangle', color))}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">
      <Shapes size={18} className="text-indigo-600" /> Adicionar forma
    </button>
  </div>;
}
