import type { CanvasShape } from '../../../domain/menu/model';
import { getCanvasShapeDimensions, getCanvasShapeTextLayout, getShapeTextStyle } from '../../../domain/menu/canvasShapes';

export function ShapeTextEditor({ shape, imageWidth, targetId, onChange, onClose, onFocus }: {
  shape: CanvasShape;
  imageWidth: number;
  targetId: string;
  onChange: (text: string) => void;
  onClose: () => void;
  onFocus: () => void;
}) {
  const layout = getCanvasShapeTextLayout(shape);
  const scale = imageWidth / getCanvasShapeDimensions(shape).width;
  const text = getShapeTextStyle(shape);
  const ink = text.color;
  return <textarea
    aria-label="Texto da forma" placeholder="Digite aqui" data-inline-format-target={targetId} data-drag-ignore="true"
    value={shape.text || ''} rows={1} onFocus={onFocus} onClick={event => { event.stopPropagation(); onFocus(); }}
    onChange={event => onChange(event.currentTarget.value)}
    onPointerDown={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        event.currentTarget.blur();
        onClose();
      }
    }}
    className="absolute left-1/2 top-1/2 resize-none overflow-hidden border-0 bg-transparent p-0 font-semibold text-transparent outline-none placeholder:text-[color:var(--shape-text-ink)] placeholder:opacity-65"
    style={{
      '--shape-text-ink': ink,
      caretColor: ink,
      fontFamily: `${text.fontFamily}, Arial, sans-serif`,
      fontWeight: text.fontWeight,
      fontStyle: text.italic ? 'italic' : 'normal',
      fontSize: layout.size * scale,
      lineHeight: 1.22,
      textAlign: layout.align,
      width: layout.width * scale,
      height: layout.size * 1.22 * layout.lines.length * scale,
      transform: `translate(-50%, -50%) rotate(${shape.rotation}deg) translateY(${layout.centerY * scale}px)`,
    } as React.CSSProperties}
  />;
}
