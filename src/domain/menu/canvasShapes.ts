import { resolveTextOutline } from './textOutline';
import { isMiniFoodKind, miniFoodArtwork, type MiniFoodKind } from './miniFoods';
import type { AddedImage, CanvasShape, CanvasShapeKind, ElementStyle } from './model';

type GeometricShape = Exclude<CanvasShapeKind, MiniFoodKind>;

export const canvasShapeKinds: [GeometricShape, string][] = [
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

type Point = [number, number];

function polygonPoints(count: number, inner: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = 2 * Math.PI * index / count - Math.PI / 2;
    const radius = index % 2 ? inner : 43;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  });
}

function polygonShape(points: Point[], rounding: number) {
  if (!(rounding > 0)) return `<polygon points="${points.map(point => point.join(',')).join(' ')}"/>`;

  const path = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const approach = (neighbor: Point) => {
      const distance = Math.hypot(neighbor[0] - point[0], neighbor[1] - point[1]);
      const fraction = distance > 0 ? Math.min(.5, rounding / distance) : 0;
      return point.map((coordinate, axis) => +(coordinate + (neighbor[axis] - coordinate) * fraction).toFixed(3)).join(' ');
    };
    return `${index === 0 ? 'M' : 'L'} ${approach(previous)} Q ${point.join(' ')} ${approach(next)}`;
  });
  return `<path d="${path.join(' ')} Z"/>`;
}

export function getCanvasShapeDimensions(shape: CanvasShape) {
  const degrees = shape.rotation * Math.PI / 180;
  const width = 100 * (Math.abs(Math.cos(degrees)) * shape.ratio + Math.abs(Math.sin(degrees)));
  const height = 100 * (Math.abs(Math.sin(degrees)) * shape.ratio + Math.abs(Math.cos(degrees)));
  return { width, height };
}

export function shapeTextColor(shape: CanvasShape) {
  if (shape.textStyle?.color && /^#[0-9a-f]{6}$/i.test(shape.textStyle.color)) return shape.textStyle.color;
  if (shape.textColor && /^#[0-9a-f]{6}$/i.test(shape.textColor)) return shape.textColor;
  const channels = [1, 3, 5].map(index => parseInt(shape.fill.slice(index, index + 2), 16));
  return channels[0] * .299 + channels[1] * .587 + channels[2] * .114 > 154 ? '#172033' : '#ffffff';
}

export function getCanvasShapeTextLayout(shape: CanvasShape) {
  const compact = ['star', 'diamond', 'triangle', 'arrow'].includes(shape.kind);
  const width = (compact ? 39 : shape.kind === 'rectangle' ? 78 : 60) * shape.ratio;
  const height = compact ? 29 : 60;
  const centerY = shape.kind === 'triangle' ? 16 : 0;
  const paragraphs = (shape.text || '').replace(/\r/g, '').split('\n');
  let size = Math.min(shape.textStyle?.fontSize || 14, width / 2);
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
  return { width, centerY, size, lines, align: shape.textStyle?.textAlign || shape.textAlign || 'center' };
}

// SVG text is part of the image, including in exported menus and pasted copies.
function shapeLabel(shape: CanvasShape) {
  if (!shape.text?.trim()) return '';
  const { width, centerY, size, lines, align } = getCanvasShapeTextLayout(shape);
  const x = align === 'left' ? -width / 2 : align === 'right' ? width / 2 : 0;
  const font = (shape.textStyle?.fontFamily || 'Arial').replace(/[^\p{L}\d -]/gu, '');
  const weight = shape.textStyle?.fontWeight === 'bold' || shape.textStyle?.fontWeight === '700' ? '700'
    : shape.textStyle?.fontWeight === '400' ? '400' : '600';
  const outline = resolveTextOutline(shape.textStyle?.textOutline);
  const stroke = outline ? ` stroke="${outline.color}" stroke-width="${Math.min(outline.width, size * 0.2)}" stroke-linejoin="round" paint-order="stroke fill"` : '';
  const escape = (line: string) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const background = shape.textBackground && /^#[0-9a-f]{6}$/i.test(shape.textBackground)
    ? `<rect x="${-width / 2 - 2}" y="${centerY - lines.length * size * .61 - 2}" width="${width + 4}" height="${lines.length * size * 1.22 + 4}" rx="2" fill="${shape.textBackground}"/>` : '';
  return `<g transform="rotate(${shape.rotation})" fill="${shapeTextColor(shape)}" font-family="${font},Arial,sans-serif" font-size="${size}" font-weight="${weight}" font-style="${shape.textStyle?.italic ? 'italic' : 'normal'}" text-decoration="${shape.textStyle?.underline ? 'underline' : 'none'}" text-anchor="${align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'}">${background}${lines.map((line, index) =>
    `<text x="${x}" y="${centerY + (index - (lines.length - 1) / 2) * size * 1.22 + size * .34}"${stroke}>${escape(line)}</text>`).join('')}</g>`;
}

export function canvasShapeUrl(shape: CanvasShape, includeText = true) {
  const hex = (color: string) => /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f46e5';
  const { width, height } = getCanvasShapeDimensions(shape);
  const geometry: Record<GeometricShape, () => string> = {
    rectangle: () => `<rect x="6" y="6" width="88" height="88" rx="${shape.corners}"/>`,
    ellipse: () => '<ellipse cx="50" cy="50" rx="44" ry="44"/>',
    triangle: () => '<polygon points="50,7 94,93 6,93"/>',
    diamond: () => polygonShape([[50, 6], [94, 50], [50, 94], [6, 50]], shape.corners),
    polygon: () => polygonShape(polygonPoints(shape.points, 43), shape.corners),
    star: () => polygonShape(polygonPoints(shape.points * 2, shape.innerRadius * .43), shape.corners),
    arrow: () => polygonShape([[6, 35], [60, 35], [60, 9], [94, 50], [60, 91], [60, 65], [6, 65]], shape.corners),
    line: () => '<path d="M 6,50 H 94"/>',
  };
  const kind = shape.kind;
  const miniFood = isMiniFoodKind(kind);
  const content = miniFood
    ? `<g transform="scale(4.1666667)">${miniFoodArtwork(kind, hex(shape.fill))}</g>`
    : geometry[kind]?.() || '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}"><g transform="rotate(${shape.rotation}) scale(${shape.ratio} 1) translate(-50 -50)" fill="${hex(shape.fill)}" stroke="${hex(shape.stroke)}" stroke-width="${shape.kind === 'line' ? Math.max(1, shape.strokeWidth) : shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${content}</g>${miniFood || !includeText ? '' : shapeLabel(shape)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type CanvasShapeParameters = Partial<Omit<CanvasShape, 'kind' | 'text' | 'ratio'>>;

export function getCanvasShapeParameters(shape: CanvasShape): CanvasShapeParameters {
  const { fill, stroke, strokeWidth, rotation, corners, points, innerRadius } = shape;
  if (isMiniFoodKind(shape.kind)) return { rotation, fill };
  return {
    stroke, strokeWidth, textColor: shape.textColor, textAlign: shape.textAlign, textStyle: shape.textStyle,
    ...(shape.kind !== 'ellipse' && { rotation }),
    ...(shape.kind !== 'line' && { fill }),
    ...(['rectangle', 'diamond', 'polygon', 'star', 'arrow'].includes(shape.kind) && { corners }),
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
  const url = canvasShapeUrl(shape);
  if (shape.rotation === image.shape.rotation) return { ...image, shape, url };
  const previous = getCanvasShapeDimensions(image.shape);
  const next = getCanvasShapeDimensions(shape);
  const scale = image.width / previous.width;
  const width = next.width * scale;
  return { ...image, shape, url, width,
    x: image.x + (image.width - width) / 2,
    y: image.y + (previous.height - next.height) * scale / 2,
  };
}

export function getShapeTextStyle(shape: CanvasShape): ElementStyle {
  return {
    fontFamily: 'Arial', fontSize: 14, fontWeight: '600', textAlign: shape.textAlign || 'center',
    ...shape.textStyle, color: shapeTextColor(shape),
  };
}

export function setCanvasImageBackground(image: AddedImage, enabled: boolean, pageIndex = image.pageIndex): AddedImage {
  if (enabled === Boolean(image.repeatAsBackground)) {
    return image.backgroundPromptDismissed ? image : { ...image, backgroundPromptDismissed: true };
  }
  return enabled
    ? { ...image, backgroundPromptDismissed: true, repeatAsBackground: true, previousZIndex: image.zIndex, zIndex: 1 }
    : { ...image, backgroundPromptDismissed: true, pageIndex, repeatAsBackground: false,
      zIndex: image.previousZIndex ?? 1, previousZIndex: undefined };
}

export function getSelectedLayerIds(items: readonly { type: string; id: string }[], sourceId: string): Set<string> {
  const ids = items.filter(item => item.type === 'addedImage').map(item => item.id);
  return new Set(ids.includes(sourceId) ? ids : [sourceId]);
}
