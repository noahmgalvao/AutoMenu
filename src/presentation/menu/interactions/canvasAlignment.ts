type Box = { left: number; top: number; width: number; height: number };
type Axis = 'x' | 'y';
type Guide = { axis: Axis; at: number; span?: [number, number] };
const screenTolerance = 5;

const anchors = (start: number, length: number) => [start, start + length / 2, start + length];

export function snapCanvasBox(moving: Box, page: Box, targets: readonly Box[], axes: readonly Axis[] = ['x', 'y']) {
  const position = { left: moving.left, top: moving.top };
  const guides: Guide[] = [];
  for (const axis of axes) {
    const start = axis === 'x' ? 'left' : 'top';
    const size = axis === 'x' ? 'width' : 'height';
    const edges = anchors(moving[start], moving[size]);
    const center = page[start] + page[size] / 2;
    const crossStart = axis === 'x' ? 'top' : 'left';
    const crossSize = axis === 'x' ? 'height' : 'width';
    let nearest: { distance: number; guide: Guide } | undefined;
    const consider = (origin: number, at: number, span?: Guide['span']) => {
      const distance = at - origin;
      const next = moving[start] + distance;
      if (Math.abs(distance) > screenTolerance || next < page[start] - .01
        || next + moving[size] > page[start] + page[size] + .01) return;
      if (!nearest || Math.abs(distance) < Math.abs(nearest.distance)) nearest = { distance, guide: span ? { axis, at, span } : { axis, at } };
    };
    consider(edges[1], center);
    for (const target of targets) {
      const span: Guide['span'] = [
        Math.min(moving[crossStart], target[crossStart]),
        Math.max(moving[crossStart] + moving[crossSize], target[crossStart] + target[crossSize]),
      ];
      for (const at of anchors(target[start], target[size])) {
        // The page midpoint is reserved for the moving object's own midpoint.
        if (Math.abs(at - center) <= screenTolerance) continue;
        for (const edge of edges) consider(edge, at, span);
      }
    }
    if (!nearest) continue;
    position[start] += nearest.distance;
    guides.push(nearest.guide);
  }
  return { ...position, guides };
}

export function alignCanvasBox(page: HTMLElement, moving: Box, excluded: ReadonlySet<string>, axes?: readonly Axis[]) {
  const movingTargets = Array.from(page.querySelectorAll<HTMLElement>('[data-added-image-id], [data-canvas-free-text-id]'))
    .filter(element => !excluded.has(element.dataset.addedImageId || element.dataset.canvasFreeTextId || ''))
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  return snapCanvasBox(moving, page.getBoundingClientRect(), movingTargets, axes);
}

let overlay: HTMLDivElement | undefined;

export function clearCanvasAlignment() {
  overlay?.remove();
  overlay = undefined;
}

export function showCanvasAlignment(page: HTMLElement, guides: Guide[]) {
  if (!guides.length) { clearCanvasAlignment(); return; }
  if (overlay?.parentElement !== page) {
    clearCanvasAlignment();
    overlay = document.createElement('div');
    overlay.dataset.canvasAlignment = 'true';
    overlay.dataset.printControl = 'true';
    overlay.setAttribute('aria-hidden', 'true');
    page.append(overlay);
  }
  const bounds = page.getBoundingClientRect();
  overlay!.replaceChildren(...guides.map(({ axis, at, span }) => {
    const line = document.createElement('span');
    line.dataset.canvasGuide = axis;
    const vertical = axis === 'x';
    const fraction = vertical ? (at - bounds.left) / bounds.width : (at - bounds.top) / bounds.height;
    line.style[vertical ? 'left' : 'top'] = `${fraction * 100}%`;
    if (span) {
      const start = vertical ? bounds.top : bounds.left;
      const size = vertical ? bounds.height : bounds.width;
      line.style[vertical ? 'top' : 'left'] = `${Math.max(0, (span[0] - start) / size) * 100}%`;
      line.style[vertical ? 'bottom' : 'right'] = `${Math.max(0, 1 - (span[1] - start) / size) * 100}%`;
    }
    return line;
  }));
}
