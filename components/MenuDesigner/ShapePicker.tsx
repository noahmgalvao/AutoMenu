import React, { useState } from 'react';
import { Shapes } from 'lucide-react';
import type { CanvasShape, CanvasShapeKind } from '../../types';
import { canvasShapeKinds, canvasShapeUrl, createCanvasShape } from '../../utils/canvasShapes';
import { ColorPicker } from './ColorPicker';
import { FontSizeInput } from './FontSizeInput';

const numberFields = {
  strokeWidth: ['Contorno', 0, 12, 1],
  ratio: ['Proporção', .2, 6, .1],
  rotation: ['Rotação', 0, 360, 1],
  corners: ['Arredondamento', 0, 44, 1],
  points: ['Pontas', 3, 16, 1],
  innerRadius: ['Profundidade (%)', 10, 90, 1],
} as const;

export function ShapeSettings({ shape, onChange, onEditEnd }: {
  shape: CanvasShape;
  onChange: (next: CanvasShape) => void;
  onEditEnd?: () => void;
}) {
  const changedSlider = React.useRef(false);
  const finishSlider = () => {
    if (!changedSlider.current) return;
    changedSlider.current = false;
    onEditEnd?.();
  };
  const fields: (keyof typeof numberFields)[] = ['strokeWidth', 'ratio', 'rotation'];
  if (shape.kind === 'rectangle') fields.push('corners');
  if (shape.kind === 'star' || shape.kind === 'polygon') fields.push('points');
  if (shape.kind === 'star') fields.push('innerRadius');
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
      {shape.kind !== 'line' && <div className="flex items-center gap-1">Preenchimento
        <ColorPicker value={shape.fill} label="Cor do preenchimento" onChange={fill => {
          onChange({ ...shape, fill });
          onEditEnd?.();
        }} />
      </div>}
      <div className="flex items-center gap-1">Contorno
        <ColorPicker value={shape.stroke} label="Cor do contorno" onChange={stroke => {
          onChange({ ...shape, stroke });
          onEditEnd?.();
        }} />
      </div>
    </div>
    <div className="space-y-1">
      {fields.map(field => {
        const [label, min, max, step] = numberFields[field];
        const fieldLabel = field === 'points' && shape.kind === 'polygon' ? 'Lados' : label;
        const change = (value: number) => {
          const next = Number((Math.round(value / step) * step).toFixed(1));
          if (next === shape[field]) return;
          changedSlider.current = true;
          onChange({ ...shape, [field]: next });
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
      })}
    </div>
  </div>;
}

export function ShapePicker({ color, onAdd }: { color: string; onAdd: (shape: CanvasShape) => void }) {
  const [open, setOpen] = useState(false);
  const [shape, setShape] = useState(() => createCanvasShape('rectangle', color));
  const choose = (kind: CanvasShapeKind) => setShape(createCanvasShape(kind, shape.fill));
  return <div className="col-span-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">
      <Shapes size={18} className="text-indigo-600" /> Adicionar forma
    </button>
    {open && <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-4 gap-1">
        {canvasShapeKinds.map(([kind, label]) => (
          <button key={kind} type="button" aria-pressed={shape.kind === kind} aria-label={label} title={label}
            onClick={() => choose(kind)}
            className={`grid h-10 place-items-center rounded-lg border ${shape.kind === kind ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <img src={canvasShapeUrl(createCanvasShape(kind, '#4f46e5'))} alt="" className="h-6 w-7 object-contain" />
          </button>
        ))}
      </div>
      <div className="grid h-16 place-items-center rounded-lg bg-slate-50">
        <img src={canvasShapeUrl(shape)} alt="Prévia da forma" className="h-12 w-20 object-contain" />
      </div>
      <ShapeSettings shape={shape} onChange={setShape} />
      <button type="button" onClick={() => { onAdd(shape); setOpen(false); }}
        className="w-full rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800">Inserir forma</button>
    </div>}
  </div>;
}
