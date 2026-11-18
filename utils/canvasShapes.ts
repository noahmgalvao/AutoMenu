import type { AddedImage, CanvasShape, CanvasShapeKind } from '../types';

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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}"><g transform="rotate(${shape.rotation}) scale(${shape.ratio} 1) translate(-50 -50)" fill="${hex(shape.fill)}" stroke="${hex(shape.stroke)}" stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${geometry[shape.kind]()}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function toggleBackgroundLayer(image: AddedImage, pageIndex = image.pageIndex): AddedImage {
  return image.repeatAsBackground
    ? { ...image, pageIndex, repeatAsBackground: false, zIndex: image.previousZIndex ?? (image.shape ? 1 : 11), previousZIndex: undefined }
    : { ...image, repeatAsBackground: true, previousZIndex: image.zIndex, zIndex: 1 };
}
