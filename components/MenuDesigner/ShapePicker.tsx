import React, { useState } from 'react';
import { Shapes } from 'lucide-react';
import type { CanvasShape, CanvasShapeKind } from '../../types';
import { canvasShapeKinds, canvasShapeUrl, createCanvasShape } from '../../utils/canvasShapes';
import { ColorPicker } from './ColorPicker';

const numberFields = {
  strokeWidth: ['Contorno', 0, 12, 1],
  ratio: ['Proporção', .2, 6, .1],
  rotation: ['Rotação', 0, 360, 1],
  corners: ['Arredondamento', 0, 44, 1],
  points: ['Pontas', 3, 16, 1],
  innerRadius: ['Profundidade (%)', 10, 90, 1],
} as const;

export function ShapeSettings({ shape, onChange }: { shape: CanvasShape; onChange: (next: CanvasShape) => void }) {
  const fields: (keyof typeof numberFields)[] = ['strokeWidth', 'ratio', 'rotation'];
  if (shape.kind === 'rectangle') fields.push('corners');
  if (shape.kind === 'star' || shape.kind === 'polygon') fields.push('points');
  if (shape.kind === 'star') fields.push('innerRadius');
  return <div className="space-y-2">
    <div className="flex gap-4 text-xs text-slate-600">
      {shape.kind !== 'line' && <label className="flex items-center gap-1.5">Preenchimento
        <ColorPicker value={shape.fill} label="Cor do preenchimento" onChange={fill => onChange({ ...shape, fill })} />
      </label>}
      <label className="flex items-center gap-1.5">Contorno
        <ColorPicker value={shape.stroke} label="Cor do contorno" onChange={stroke => onChange({ ...shape, stroke })} />
      </label>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {fields.map(field => {
        const [label, min, max, step] = numberFields[field];
        return <label key={field} className="text-[10px] font-medium text-slate-600">
          {field === 'points' && shape.kind === 'polygon' ? 'Lados' : label}
          <input type="number" min={min} max={max} step={step} defaultValue={shape[field]} key={shape[field]}
            onBlur={event => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value) && value !== shape[field]) onChange({ ...shape, [field]: Math.min(max, Math.max(min, Math.round(value / step) * step)) });
            }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" />
        </label>;
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
