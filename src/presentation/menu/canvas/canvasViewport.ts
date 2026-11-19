export function getCanvasViewportBounds(canvas: HTMLElement) {
    const canvasRect = canvas.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = Math.max(canvasRect.left, viewport?.offsetLeft || 0);
    const right = Math.min(canvasRect.right, (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth));
    const top = Math.max(canvasRect.top, viewport?.offsetTop || 0);
    const sheetHeight = !matchMedia('(min-width: 768px)').matches
        ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--automenu-bottom-sheet-height')) || 0) * window.innerHeight / 100
        : 0;
    const bottom = Math.max(top + 1, Math.min(canvasRect.bottom, window.innerHeight - sheetHeight,
        (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)));
    return { left, right, top, bottom };
}

export function getCanvasViewportFocus(canvas: HTMLElement | null | undefined) {
    if (!canvas) return null;
    const { left, right, top, bottom } = getCanvasViewportBounds(canvas);
    const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
    const pages = Array.from(canvas.querySelectorAll<HTMLElement>('[data-menu-print-page][data-page-index]'), page => {
        const rect = page.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left))
            * Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
        const distance = Math.hypot(
            Math.max(0, rect.left - center.x, center.x - rect.right),
            Math.max(0, rect.top - center.y, center.y - rect.bottom),
        );
        return { page, rect, overlap, distance };
    }).filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const nearest = pages.sort((a, b) => Number(a.distance !== 0) - Number(b.distance !== 0)
        || b.overlap - a.overlap || a.distance - b.distance)[0];
    if (!nearest) return null;
    const { page, rect } = nearest;
    const scale = rect.width / Math.max(1, page.offsetWidth);
    const point = {
        x: Math.max(rect.left + 1, Math.min(rect.right - 1, center.x)),
        y: Math.max(rect.top + 1, Math.min(rect.bottom - 1, center.y)),
    };
    const lane = Array.from(page.querySelectorAll<HTMLElement>('[data-drag-column-container="category"]'))
        .find(element => {
            const bounds = element.getBoundingClientRect();
            return point.x >= bounds.left && point.x <= bounds.right;
        });
    return {
        point,
        pageIndex: Number(page.dataset.pageIndex),
        columnIndex: Number(lane?.dataset.dragColumnIndex) || 0,
        x: (point.x - rect.left) / scale,
        y: (point.y - rect.top) / scale,
        visibleTop: Math.max(0, (top - rect.top) / scale),
        visibleBottom: Math.min(page.offsetHeight, (bottom - rect.top) / scale),
    };
}

export function getCanvasProduct(canvas: HTMLElement, id: string) {
    return Array.from(canvas.querySelectorAll<HTMLElement>('[data-drag-type="product"][data-drag-id]'))
        .find(element => element.dataset.dragId === id);
}

export function getCanvasProductBounds(product: HTMLElement) {
    const fields = product.querySelectorAll('[data-product-edit-id]');
    const rects = [product, ...fields].map(element => element.getBoundingClientRect());
    return {
        left: Math.min(...rects.map(rect => rect.left)),
        right: Math.max(...rects.map(rect => rect.right)),
        top: Math.min(...rects.map(rect => rect.top)),
        bottom: Math.max(...rects.map(rect => rect.bottom)),
    };
}

export function centerCanvasProduct(canvas: HTMLElement, id: string) {
    const product = getCanvasProduct(canvas, id);
    if (!product) return;
    const bounds = getCanvasProductBounds(product);
    const visible = getCanvasViewportBounds(canvas);
    canvas.scrollTo({
        left: canvas.scrollLeft + (bounds.left + bounds.right - visible.left - visible.right) / 2,
        top: canvas.scrollTop + (bounds.top + bounds.bottom - visible.top - visible.bottom) / 2,
    });
}

export function positionCanvasImage(
    focus: ReturnType<typeof getCanvasViewportFocus>, page: { widthPx: number; heightPx: number }, width: number, aspect: number,
) {
    const fittedWidth = Math.max(1, Math.floor(Math.min(width, page.widthPx, page.heightPx / aspect)));
    return {
        width: fittedWidth,
        pageIndex: focus?.pageIndex ?? 0,
        x: Math.round(Math.max(0, Math.min(page.widthPx - fittedWidth, (focus?.x ?? page.widthPx / 2) - fittedWidth / 2))),
        y: Math.round(Math.max(0, Math.min(page.heightPx - fittedWidth * aspect, (focus?.y ?? page.heightPx / 2) - fittedWidth * aspect / 2))),
    };
}

export type CanvasPoint = { x: number; y: number };

export function getZoomAnchor(layer: HTMLElement, point: CanvasPoint): CanvasPoint {
    const rect = layer.getBoundingClientRect();
    const scale = rect.width / layer.offsetWidth;
    return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale };
}

// Scroll to keep the same document point under the gesture. At the scroll limits
// the workspace can grow a gutter so zooming out still keeps the point in place.
export function restoreZoomAnchor(canvas: HTMLElement, layer: HTMLElement, anchor: CanvasPoint, point: CanvasPoint) {
    const surface = layer.parentElement!;
    surface.style.marginInline = '0';
    surface.style.padding = '';
    surface.style.minWidth = '';
    surface.style.minHeight = '';
    const rect = layer.getBoundingClientRect();
    const scale = rect.width / layer.offsetWidth;
    const left = canvas.scrollLeft + rect.left + anchor.x * scale - point.x;
    const top = canvas.scrollTop + rect.top + anchor.y * scale - point.y;
    surface.style.paddingLeft = `${Math.max(0, -left)}px`;
    surface.style.paddingTop = `${Math.max(0, -top)}px`;
    if (left > canvas.scrollWidth - canvas.clientWidth) surface.style.minWidth = `${Math.ceil(left + canvas.clientWidth)}px`;
    if (top > canvas.scrollHeight - canvas.clientHeight) surface.style.minHeight = `${Math.ceil(top + canvas.clientHeight)}px`;
    canvas.scrollTo({ left, top, behavior: 'instant' });
}

function touchZoomGeometry(touches: TouchList) {
    const [a, b] = [touches[0], touches[1]];
    return { point: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
}

export function bindCanvasZoomGestures(
    canvas: HTMLElement, layer: HTMLElement, getScale: () => number,
    zoomAt: (scale: number, point: CanvasPoint, anchor: CanvasPoint) => void,
) {
    let pinch: { distance: number; scale: number; anchor: CanvasPoint } | undefined;
    const wheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const point = { x: event.clientX, y: event.clientY };
        zoomAt(getScale() - event.deltaY * 0.005, point, getZoomAnchor(layer, point));
    };
    const start = (event: TouchEvent) => {
        if (event.touches.length !== 2) return;
        event.preventDefault();
        const { point, distance } = touchZoomGeometry(event.touches);
        pinch = { distance: Math.max(1, distance), scale: getScale(), anchor: getZoomAnchor(layer, point) };
    };
    const move = (event: TouchEvent) => {
        if (!pinch || event.touches.length !== 2) return;
        event.preventDefault();
        const { point, distance } = touchZoomGeometry(event.touches);
        zoomAt(pinch.scale * distance / pinch.distance, point, pinch.anchor);
    };
    const end = () => { pinch = undefined; };
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    return () => {
        canvas.removeEventListener('wheel', wheel);
        canvas.removeEventListener('touchstart', start);
        canvas.removeEventListener('touchmove', move);
        canvas.removeEventListener('touchend', end);
        canvas.removeEventListener('touchcancel', end);
    };
}
