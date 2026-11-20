import type { AddedImage } from '../../../domain/menu/model';
import { canvasShapeUrl, getCanvasShapeDimensions, getCanvasShapeTextLayout, getShapeTextStyle } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind } from '../../../domain/menu/miniFoods';
import { getTextOutlineStyle } from './textOutlineStyle';

export function CanvasLayerImage({ image, alt = '', ghost = false }: { image: AddedImage; alt?: string; ghost?: boolean }) {
  const flip = image.flipHorizontal || image.flipVertical
    ? `scale(${image.flipHorizontal ? -1 : 1}, ${image.flipVertical ? -1 : 1})` : undefined;
  const { crop } = image;
  const shape = image.shape;
  if (!ghost && !crop && shape?.text?.trim() && !isMiniFoodKind(shape.kind)) {
    const layout = getCanvasShapeTextLayout(shape);
    const scale = image.width / getCanvasShapeDimensions(shape).width;
    const text = getShapeTextStyle(shape);
    return <span className="pointer-events-none relative block select-none" style={{ transform: flip }}>
      <img src={canvasShapeUrl(shape, false)} alt={alt} draggable={false} className="block h-auto w-full" />
      <span aria-hidden="true" data-shape-text className="absolute left-1/2 top-1/2 block"
        style={{
          width: layout.width * scale,
          transform: `translate(-50%, -50%) rotate(${shape.rotation}deg) translateY(${layout.centerY * scale}px)`,
          fontFamily: `${text.fontFamily}, Arial, sans-serif`,
          fontSize: layout.size * scale,
          fontWeight: text.fontWeight,
          fontStyle: text.italic ? 'italic' : 'normal',
          textDecoration: text.underline ? 'underline' : 'none',
          textAlign: layout.align,
          lineHeight: 1.22,
          color: text.color,
          background: shape.textBackground,
          borderRadius: 2 * scale,
          boxShadow: shape.textBackground ? `0 0 0 ${2 * scale}px ${shape.textBackground}` : undefined,
          ...getTextOutlineStyle(text.textOutline, scale),
        }}>
        {layout.lines.map((line, index) => <span key={index} className="block whitespace-pre">{line || '\u00a0'}</span>)}
      </span>
    </span>;
  }
  if (!crop) return <img src={image.url} alt={alt} aria-hidden={ghost || undefined} draggable={false}
    className={`block h-auto w-full pointer-events-none select-none ${ghost ? 'opacity-0' : ''}`} style={{ transform: flip }} />;
  return <span className={`pointer-events-none relative block w-full overflow-hidden ${ghost ? 'opacity-0' : ''}`}
    style={{ aspectRatio: crop.aspect * crop.width / crop.height, transform: flip }}>
    <img src={image.url} alt={alt} aria-hidden={ghost || undefined} draggable={false} className="absolute h-auto max-w-none select-none"
      style={{ left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, width: `${100 / crop.width}%` }} />
  </span>;
}
