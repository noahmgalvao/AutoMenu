import type { AddedImage } from '../../../domain/menu/model';

export function CanvasLayerImage({ image, alt = '', ghost = false }: { image: AddedImage; alt?: string; ghost?: boolean }) {
  const flip = image.flipHorizontal || image.flipVertical
    ? `scale(${image.flipHorizontal ? -1 : 1}, ${image.flipVertical ? -1 : 1})` : undefined;
  const { crop } = image;
  if (!crop) return <img src={image.url} alt={alt} aria-hidden={ghost || undefined} draggable={false}
    className={`block h-auto w-full pointer-events-none select-none ${ghost ? 'opacity-0' : ''}`} style={{ transform: flip }} />;
  return <span className={`pointer-events-none relative block w-full overflow-hidden ${ghost ? 'opacity-0' : ''}`}
    style={{ aspectRatio: crop.aspect * crop.width / crop.height, transform: flip }}>
    <img src={image.url} alt={alt} aria-hidden={ghost || undefined} draggable={false} className="absolute h-auto max-w-none select-none"
      style={{ left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, width: `${100 / crop.width}%` }} />
  </span>;
}
