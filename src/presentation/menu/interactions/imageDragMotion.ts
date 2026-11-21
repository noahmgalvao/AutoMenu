import { alignCanvasBox, clearCanvasAlignment, showCanvasAlignment } from './canvasAlignment';
import type { MenuStyle } from '../../../domain/menu/model';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';

const NEW_PAGE_SWITCH_THRESHOLD_PX = 96;
export const IMAGE_DRAG_THRESHOLD_PX = 6;
type Point = { x: number; y: number };

export const getRenderedImageDragPages = () => {
    if (typeof document === 'undefined') return [];
    return Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]'))
        .map((element) => ({
            element,
            pageIndex: Number(element.dataset.pageIndex ?? 0),
            rect: element.getBoundingClientRect(),
        }))
        .sort((left, right) => left.pageIndex - right.pageIndex);
};

export function captureImageDrag(id: string, pageIndex: number, rect: DOMRect, start: Point, scale: number, element: HTMLElement) {
    const width = Math.max(1, rect.width / scale);
    const height = Math.max(1, rect.height / scale);
    const rotated = getComputedStyle(element).rotate !== 'none';
    const insetX = rotated ? (width - element.offsetWidth) / 2 : 0;
    const insetY = rotated ? (height - element.offsetHeight) / 2 : 0;
    return {
        id, pageIndex, scale,
        offsetX: (start.x - rect.left) / scale,
        offsetY: (start.y - rect.top) / scale,
        height, width, insetX, insetY,
    };
}

export type ImageDragMotion = ReturnType<typeof captureImageDrag> & { backgroundText?: boolean };
export type LayerDragMove = { drag: ImageDragMotion; point: Point };
export type CanvasLayerPositions = Pick<MenuStyle, 'addedImages' | 'blankPages' | 'freeTextBackgrounds'>;

export function alignLayerMove(move: LayerDragMove, pages: ReturnType<typeof getRenderedImageDragPages>, excluded: ReadonlySet<string>) {
    const { point, drag } = move;
    const page = pages.find(({ rect }) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
    if (!page) { clearCanvasAlignment(); return point; }
    const { rect } = page;
    const width = drag.width * drag.scale;
    const height = drag.height * drag.scale;
    const left = Math.max(rect.left, Math.min(rect.right - width, point.x - drag.offsetX * drag.scale));
    const top = Math.max(rect.top, Math.min(rect.bottom - height, point.y - drag.offsetY * drag.scale));
    const aligned = alignCanvasBox(page.element, { left, top, width, height }, excluded);
    showCanvasAlignment(page.element, aligned.guides);
    return { x: point.x + aligned.left - left, y: point.y + aligned.top - top };
}

export function moveDraggedLayers(
    style: MenuStyle,
    moves: LayerDragMove[],
    pages: ReturnType<typeof getRenderedImageDragPages>,
): CanvasLayerPositions {
    const { widthPx, heightPx } = resolveMenuPageDimensions(style);
    const imageMoves = new Map(moves.filter(({ drag }) => !drag.backgroundText).map(move => [move.drag.id, move]));
    const pageCount = Math.max(1, ...pages.map(page => page.pageIndex + 1));
    let blankPages = style.blankPages || [];
    const moveLayer = (image: { x: number; y: number; pageIndex: number; width: number; repeatAsBackground?: boolean }, move: LayerDragMove) => {
        const { drag, point } = move;
        const currentPageIndex = image.repeatAsBackground ? drag.pageIndex : image.pageIndex || 0;
        const currentPage = pages.find(page => page.pageIndex === currentPageIndex) || pages[0];
        const pageAtPointer = pages.find(({ rect }) =>
            point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
        const createNextPage = currentPage && !image.repeatAsBackground && !pageAtPointer
            && !pages.some(page => page.pageIndex > currentPageIndex)
            && (point.x > currentPage.rect.right + NEW_PAGE_SWITCH_THRESHOLD_PX
                || point.y > currentPage.rect.bottom + NEW_PAGE_SWITCH_THRESHOLD_PX);
        const page = pageAtPointer || currentPage;
        const pageIndex = createNextPage ? currentPageIndex + 1 : pageAtPointer?.pageIndex ?? currentPageIndex;
        const x = createNextPage ? 0 : page ? (point.x - page.rect.left) / drag.scale - drag.offsetX : image.x;
        const y = createNextPage ? 0 : page ? (point.y - page.rect.top) / drag.scale - drag.offsetY : image.y;
        if (pageIndex >= pageCount && !blankPages.some(candidate => candidate.index === pageIndex)) {
            blankPages = [...blankPages, { id: crypto.randomUUID(), index: pageIndex, fixedPosition: true }];
        }
        return {
            pageIndex: image.repeatAsBackground ? image.pageIndex : pageIndex,
            x: Math.max(0, Math.min(x, widthPx - (drag.insetX ? drag.width : image.width))) + drag.insetX,
            y: Math.max(0, Math.min(y, heightPx - drag.height)) + drag.insetY,
        };
    };
    const addedImages = imageMoves.size ? style.addedImages?.map(image => {
        const move = imageMoves.get(image.id);
        return move ? { ...image, ...moveLayer(image, move) } : image;
    }) : style.addedImages;
    const textMoves = moves.filter(({ drag }) => drag.backgroundText);
    const freeTextBackgrounds = textMoves.length ? { ...style.freeTextBackgrounds } : style.freeTextBackgrounds;
    if (freeTextBackgrounds) {
        textMoves.forEach(move => {
            const text = freeTextBackgrounds[move.drag.id];
            if (text) freeTextBackgrounds[move.drag.id] = { ...text, ...moveLayer({ ...text, repeatAsBackground: true }, move) };
        });
    }
    return { blankPages, addedImages, freeTextBackgrounds };
}
