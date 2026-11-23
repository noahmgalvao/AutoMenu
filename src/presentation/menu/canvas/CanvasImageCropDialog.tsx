import { lockModalScrolling } from '../../common/modalScroll';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, X } from 'lucide-react';
import type { AddedImage, CanvasImageCrop } from '../../../domain/menu/model';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const minimum = .04;
type Edge = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function moveCrop(crop: CanvasImageCrop, dx: number, dy: number, edge: Edge): CanvasImageCrop {
  if (edge === 'move') return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width), y: clamp(crop.y + dy, 0, 1 - crop.height) };
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const x = edge.endsWith('w') ? clamp(crop.x + dx, 0, right - minimum) : crop.x;
  const y = edge.startsWith('n') ? clamp(crop.y + dy, 0, bottom - minimum) : crop.y;
  return {
    ...crop, x, y,
    width: (edge.endsWith('e') ? clamp(right + dx, x + minimum, 1) : right) - x,
    height: (edge.startsWith('s') ? clamp(bottom + dy, y + minimum, 1) : bottom) - y,
  };
}

export function CanvasImageCropDialog({ image, onClose, onApply }: {
  image: AddedImage;
  onClose: () => void;
  onApply: (crop: CanvasImageCrop) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; edge: Edge; crop: CanvasImageCrop; x: number; y: number; width: number; height: number } | null>(null);
  const [crop, setCrop] = useState(() => image.crop || { x: 0, y: 0, width: 1, height: 1, aspect: 1 });
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const unlock = lockModalScrolling(element);
    return () => { unlock?.(); element?.close(); };
  }, []);

  return createPortal(<dialog ref={dialog} aria-label="Cortar imagem" data-editor-popover="true" data-no-browser-selection
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    className="w-[min(42rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl backdrop:bg-black/60 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold"><Crop size={18} /> Cortar imagem</h2>
      <button type="button" aria-label="Fechar corte" onClick={onClose}><X size={19} /></button>
    </div>
    <div className="grid place-items-center overflow-hidden rounded-lg bg-slate-100 p-2">
      <div ref={stage} className="relative overflow-hidden"
        style={{ width: `min(36rem, 100%, calc(55dvh * ${crop.aspect}))`, aspectRatio: crop.aspect }}>
        <img src={image.url} alt="Imagem original" draggable={false} className="absolute inset-0 h-full w-full"
          onLoad={event => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!naturalWidth || !naturalHeight) return;
            setCrop(previous => ({ ...previous, aspect: naturalWidth / naturalHeight }));
            setReady(true);
          }} />
        {ready && <div aria-label="Área de corte"
          className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_200vmax_rgb(15_23_42/.65)]"
          style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}
          onPointerDown={event => {
            if (event.button !== 0 || !event.isPrimary || !stage.current) return;
            const { width, height } = stage.current.getBoundingClientRect();
            const edge = (event.target as HTMLElement).dataset.cropEdge as Edge | undefined;
            gesture.current = { id: event.pointerId, edge: edge || 'move', crop, x: event.clientX, y: event.clientY, width, height };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const g = gesture.current;
            if (g?.id === event.pointerId) setCrop(moveCrop(g.crop, (event.clientX - g.x) / g.width, (event.clientY - g.y) / g.height, g.edge));
          }}
          onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
          {([
            ['nw', 'Canto superior esquerdo', 'left-0 top-0 cursor-nwse-resize'],
            ['ne', 'Canto superior direito', 'right-0 top-0 cursor-nesw-resize'],
            ['sw', 'Canto inferior esquerdo', 'left-0 bottom-0 cursor-nesw-resize'],
            ['se', 'Canto inferior direito', 'right-0 bottom-0 cursor-nwse-resize'],
          ] as const).map(([edge, label, position]) => <button key={edge} type="button" data-crop-edge={edge} aria-label={label}
            className={`absolute size-6 rounded-sm border-2 border-white bg-white/55 ${position}`}
            onKeyDown={event => {
              const deltas: Record<string, [number, number]> = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] };
              const delta = deltas[event.key];
              if (!delta) return;
              event.preventDefault();
              setCrop(previous => moveCrop(previous, ...delta, edge));
            }} />)}
        </div>}
      </div>
    </div>
    <div className="mt-3 flex justify-between gap-2 text-sm">
      <button type="button" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" onClick={onClose}>Cancelar</button>
      <button type="button" disabled={!ready} className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white disabled:opacity-40"
        onClick={() => onApply(crop)}>Aplicar corte</button>
    </div>
  </dialog>, document.body);
}
