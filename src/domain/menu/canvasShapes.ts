import type { AddedImage, CanvasShape, CanvasShapeKind } from './model';

export const canvasShapeKinds: [CanvasShapeKind, string][] = [
  ['rectangle', 'Retângulo'], ['ellipse', 'Elipse'], ['triangle', 'Triângulo'], ['diamond', 'Losango'],
  ['polygon', 'Polígono'], ['star', 'Estrela'], ['arrow', 'Seta'], ['line', 'Linha'],
];

export function createCanvasShape(kind: CanvasShapeKind, fill: string): CanvasShape {
  return {
    kind, fill, stroke: fill, strokeWidth: kind === 'line' ? 4 : 0,
    ratio: kind === 'line' ? 5 : kind === 'arrow' ? 1.6 : 1,
    rotation: 0, corners: 0, points: kind === 'polygon' ? 6 : 5, innerRadius: 50,
  };
}

function polygonPoints(count: number, inner: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = 2 * Math.PI * index / count - Math.PI / 2;
    const radius = index % 2 ? inner : 43;
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  }).join(' ');
}

export function getCanvasShapeDimensions(shape: CanvasShape) {
  const degrees = shape.rotation * Math.PI / 180;
  const width = 100 * (Math.abs(Math.cos(degrees)) * shape.ratio + Math.abs(Math.sin(degrees)));
  const height = 100 * (Math.abs(Math.sin(degrees)) * shape.ratio + Math.abs(Math.cos(degrees)));
  return { width, height };
}

export function shapeTextColor(shape: CanvasShape) {
  if (shape.textColor && /^#[0-9a-f]{6}$/i.test(shape.textColor)) return shape.textColor;
  const channels = [1, 3, 5].map(index => parseInt(shape.fill.slice(index, index + 2), 16));
  return channels[0] * .299 + channels[1] * .587 + channels[2] * .114 > 154 ? '#172033' : '#ffffff';
}

// SVG text is part of the image, including in exported menus and pasted copies.
function shapeLabel(shape: CanvasShape) {
  if (!shape.text?.trim()) return '';
  const compact = ['star', 'diamond', 'triangle', 'arrow'].includes(shape.kind);
  const width = (compact ? 39 : shape.kind === 'rectangle' ? 78 : 60) * shape.ratio;
  const height = compact ? 29 : 60;
  const centerY = shape.kind === 'triangle' ? 16 : 0;
  const paragraphs = shape.text.replace(/\r/g, '').split('\n');
  let size = Math.min(14, width / 2);
  let lines: string[];
  do {
    const limit = Math.max(1, Math.floor(width / (size * .68)));
    lines = paragraphs.flatMap(paragraph => {
      const rows: string[] = [];
      let row = '';
      for (const word of paragraph.split(/\s+/)) {
        if (row && Array.from(row + ' ' + word).length > limit) { rows.push(row); row = ''; }
        const chars = Array.from(word);
        let start = 0;
        for (; start + limit < chars.length; start += limit) {
          rows.push(chars.slice(start, start + limit).join(''));
        }
        row = (row ? row + ' ' : '') + chars.slice(start).join('');
      }
      return [...rows, row];
    });
    if (size * 1.22 * lines.length <= height || size <= .5) break;
    size *= .9;
  } while (true);
  size = Math.min(size, height / (1.22 * lines.length));
  const align = shape.textAlign || 'center';
  const x = align === 'left' ? -width / 2 : align === 'right' ? width / 2 : 0;
  const escape = (line: string) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<g transform="rotate(${shape.rotation})" fill="${shapeTextColor(shape)}" font-family="Arial,sans-serif" font-size="${size}" font-weight="600" text-anchor="${align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'}">${lines.map((line, index) =>
    `<text x="${x}" y="${centerY + (index - (lines.length - 1) / 2) * size * 1.22 + size * .34}">${escape(line)}</text>`).join('')}</g>`;
}

export function canvasShapeUrl(shape: CanvasShape) {
  const hex = (color: string) => /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f46e5';
  const { width, height } = getCanvasShapeDimensions(shape);
  const geometry: Record<CanvasShapeKind, () => string> = {
    rectangle: () => `<rect x="6" y="6" width="88" height="88" rx="${shape.corners}"/>`,
    ellipse: () => '<ellipse cx="50" cy="50" rx="44" ry="44"/>',
    triangle: () => '<polygon points="50,7 94,93 6,93"/>',
    diamond: () => '<polygon points="50,6 94,50 50,94 6,50"/>',
    polygon: () => `<polygon points="${polygonPoints(shape.points, 43)}"/>`,
    star: () => `<polygon points="${polygonPoints(shape.points * 2, shape.innerRadius * .43)}"/>`,
    arrow: () => '<polygon points="6,35 60,35 60,9 94,50 60,91 60,65 6,65"/>',
    line: () => '<path d="M 6,50 H 94"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}"><g transform="rotate(${shape.rotation}) scale(${shape.ratio} 1) translate(-50 -50)" fill="${hex(shape.fill)}" stroke="${hex(shape.stroke)}" stroke-width="${shape.kind === 'line' ? Math.max(1, shape.strokeWidth) : shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${geometry[shape.kind]()}</g>${shapeLabel(shape)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type CanvasShapeParameters = Partial<Omit<CanvasShape, 'kind' | 'text'>>;

export function getCanvasShapeParameters(shape: CanvasShape): CanvasShapeParameters {
  const { fill, stroke, strokeWidth, ratio, rotation, corners, points, innerRadius } = shape;
  return {
    stroke, strokeWidth, ratio, rotation, textColor: shape.textColor, textAlign: shape.textAlign,
    ...(shape.kind !== 'line' && { fill }),
    ...(shape.kind === 'rectangle' && { corners }),
    ...((shape.kind === 'star' || shape.kind === 'polygon') && { points }),
    ...(shape.kind === 'star' && { innerRadius }),
  };
}

export function applyCanvasShapeParameters(image: AddedImage, patch: CanvasShapeParameters): AddedImage {
  if (!image.shape) return image;
  const applicable = getCanvasShapeParameters(image.shape);
  const updates = Object.fromEntries(Object.entries(patch).filter(([key]) => key in applicable));
  if (Object.keys(updates).length === 0) return image;
  const shape = { ...image.shape, ...updates };
  return { ...image, shape, url: canvasShapeUrl(shape) };
}

export function setCanvasImageBackground(image: AddedImage, enabled: boolean, pageIndex = image.pageIndex): AddedImage {
  if (enabled === Boolean(image.repeatAsBackground)) {
    return image.backgroundPromptDismissed ? image : { ...image, backgroundPromptDismissed: true };
  }
  return enabled
    ? { ...image, backgroundPromptDismissed: true, repeatAsBackground: true, previousZIndex: image.zIndex, zIndex: 1 }
    : { ...image, backgroundPromptDismissed: true, pageIndex, repeatAsBackground: false,
      zIndex: image.previousZIndex ?? (image.shape ? 1 : 11), previousZIndex: undefined };
}

export function getSelectedLayerIds(items: readonly { type: string; id: string }[], sourceId: string): Set<string> {
  const ids = items.filter(item => item.type === 'addedImage').map(item => item.id);
  return new Set(ids.includes(sourceId) ? ids : [sourceId]);
}
