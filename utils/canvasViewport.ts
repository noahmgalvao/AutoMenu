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
