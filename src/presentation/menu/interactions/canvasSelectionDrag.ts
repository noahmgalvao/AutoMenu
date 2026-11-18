import { FREE_TEXT_PREFIX } from '../../../domain/menu/flow';
import type { CategoryPosition, MenuStyle, Product } from '../../../domain/menu/model';
import { resolveMenuMargins } from '../../../domain/menu/styleRules';
import type { InteractionProps, SelectionItem } from './types';

type Point = { x: number; y: number };
type CanvasItem = SelectionItem & { type: 'product' | 'freeText' | 'category' | 'addedImage' };

export const isDraggableSelectionItem = (item: SelectionItem): item is CanvasItem =>
    item.type === 'product' || item.type === 'freeText' || item.type === 'category' || item.type === 'addedImage';

const getCenter = (rect: DOMRect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
const distanceToRect = (point: Point, rect: DOMRect) =>
    Math.hypot(Math.max(rect.left - point.x, 0, point.x - rect.right), Math.max(rect.top - point.y, 0, point.y - rect.bottom));

const clampPosition = (value: number, size: number, limit: number, minimum = 0) =>
    Math.max(minimum, Math.min(value, limit - size));

export function preventCanvasDragClick(canvas: HTMLElement) {
    const clear = () => {
        canvas.removeEventListener('click', preventClick, true);
        window.removeEventListener('pointerdown', clear, true);
        window.clearTimeout(timer);
    };
    const preventClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        clear();
    };
    const timer = window.setTimeout(clear, 350);
    canvas.addEventListener('click', preventClick, true);
    window.addEventListener('pointerdown', clear, true);
}

export function createCanvasSelectionDrag(
    canvas: HTMLElement,
    items: CanvasItem[],
    source: CanvasItem,
    sourceElement: HTMLElement,
    start: Point,
    props: InteractionProps,
    groups: Record<string, Product[]>,
    categoryOrder: string[],
) {
    const elements = Array.from(canvas.querySelectorAll<HTMLElement>(
        '[data-drag-type="product"][data-drag-id], [data-category-chunk], [data-added-image-id], [data-image-selection-overlay]',
    ));
    const products = new Map(props.products.map(product => [product.id, product]));
    const pages = Array.from(canvas.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]'), element => {
        const rect = element.getBoundingClientRect();
        return { element, rect, index: Number(element.dataset.pageIndex ?? 0), scale: rect.width / element.offsetWidth || 1 };
    });
    const sourcePage = sourceElement.closest('[data-menu-print-page]');
    const findElements = (item: CanvasItem) => elements.filter(element => {
        if (item.type === 'category') return element.dataset.categoryChunk === item.id;
        if (item.type === 'addedImage') return element.dataset.addedImageId === item.id;
        return element.dataset.dragId === item.id && element.dataset.dragType === 'product';
    });
    const snapshots = items.flatMap(item => {
        const matches = findElements(item);
        const element = (item.id === source.id && item.type === source.type && matches.find(candidate => sourcePage?.contains(candidate)))
            || matches[0];
        if (!element) return [];
        const page = pages.find(candidate => candidate.element.contains(element));
        if (!page) return [];
        const related = item.type === 'addedImage'
            ? [...matches, ...elements.filter(candidate => candidate.dataset.imageSelectionOverlay === item.id)]
            : matches;
        return [{ item, rect: element.getBoundingClientRect(), page, related }];
    });
    if (!snapshots.length) return null;

    const movingElements = new Set(snapshots.flatMap(snapshot => snapshot.related));
    const visuals = [...movingElements].filter(element =>
        ![...movingElements].some(parent => parent !== element && parent.contains(element))
    ).map(element => ({
        element,
        scale: pages.find(page => page.element.contains(element))?.scale || 1,
        translate: element.style.translate,
        transition: element.style.transition,
        zIndex: element.style.zIndex,
    }));
    const root = canvas;
    root.dataset.canvasSelectionDragging = 'true';
    let delta: Point = { x: 0, y: 0 };

    const restore = () => {
        delete root.dataset.canvasSelectionDragging;
        visuals.forEach(({ element, translate, transition, zIndex }) => {
            element.style.translate = translate;
            element.style.transition = transition;
            element.style.zIndex = zIndex;
        });
    };

    const move = (pointer: Point) => {
        delta = { x: pointer.x - start.x, y: pointer.y - start.y };
        visuals.forEach(({ element, scale }) => {
            element.style.transition = 'none';
            element.style.translate = `${delta.x / scale}px ${delta.y / scale}px`;
            element.style.zIndex = '75';
        });
    };

    const commit = () => {
        restore();
        if (Math.hypot(delta.x, delta.y) < 6) return;
        const margins = resolveMenuMargins(props.style);
        const itemIds = new Set(snapshots.map(({ item }) => item.id));
        const productMoves = new Map<string, typeof snapshots>();
        const categoryMoves = new Map<string, CategoryPosition>();
        const imageMoves = new Map<string, { pageIndex: number; x: number; y: number }>();
        const backgroundMoves = new Map<string, { pageIndex: number; x: number; y: number }>();

        for (const snapshot of snapshots) {
            const { item, rect } = snapshot;
            const product = products.get(item.id);
            const center = getCenter(rect);
            const destination = { x: center.x + delta.x, y: center.y + delta.y };
            const page = pages.reduce((best, candidate) =>
                distanceToRect(destination, candidate.rect) < distanceToRect(destination, best.rect) ? candidate : best, snapshot.page);
            const background = item.type === 'freeText' ? props.style.freeTextBackgrounds?.[item.id] : undefined;

            if (item.type === 'addedImage' || background) {
                const point = {
                    x: clampPosition((rect.left + delta.x - page.rect.left) / page.scale, rect.width / snapshot.page.scale, page.element.offsetWidth),
                    y: clampPosition((rect.top + delta.y - page.rect.top) / page.scale, rect.height / snapshot.page.scale, page.element.offsetHeight),
                    pageIndex: page.index,
                };
                (background ? backgroundMoves : imageMoves).set(item.id, point);
            } else if (item.type === 'category' || product?.category.startsWith(FREE_TEXT_PREFIX)) {
                const lanes = [...page.element.querySelectorAll<HTMLElement>('[data-drag-column-container="category"]')];
                if (!lanes.length) continue;
                const lane = lanes.reduce((best, candidate) =>
                    distanceToRect(destination, candidate.getBoundingClientRect()) < distanceToRect(destination, best.getBoundingClientRect())
                        ? candidate : best, lanes[0]);
                const position: CategoryPosition = {
                    pageIndex: page.index,
                    columnIndex: Number(lane.dataset.dragColumnIndex || 0),
                    y: clampPosition((rect.top + delta.y - page.rect.top) / page.scale, rect.height / snapshot.page.scale,
                        page.element.offsetHeight - margins.bottom, margins.top),
                };
                if (item.type === 'freeText') {
                    position.pageX = clampPosition((rect.left + delta.x - page.rect.left) / page.scale,
                        rect.width / snapshot.page.scale, page.element.offsetWidth);
                }
                categoryMoves.set(item.type === 'category' ? item.id : product!.category, position);
            } else if (product) {
                const members = productMoves.get(product.category) || [];
                members.push(snapshot);
                productMoves.set(product.category, members);
            }
        }

        const reorderedProducts: Record<string, string[]> = {};
        for (const [group, members] of productMoves) {
            const order = (groups[group] || []).map(product => product.id);
            const remaining = order.filter(id => !itemIds.has(id));
            const targets = elements.filter(element =>
                element.dataset.dragType === 'product' && element.dataset.dragGroup === group && remaining.includes(element.dataset.dragId || ''));
            if (!targets.length) continue;
            const member = members.find(candidate => candidate.item.id === source.id) || members[0];
            const center = getCenter(member.rect);
            const point = { x: center.x + delta.x, y: center.y + delta.y };
            const target = targets.reduce((best, candidate) =>
                distanceToRect(point, candidate.getBoundingClientRect()) < distanceToRect(point, best.getBoundingClientRect())
                    ? candidate : best, targets[0]);
            const targetRect = target.getBoundingClientRect();
            const targetCenter = getCenter(targetRect);
            const horizontal = (props.style.columnCount || 1) > 1 && point.y >= targetRect.top && point.y <= targetRect.bottom;
            const after = horizontal ? point.x >= targetCenter.x : point.y >= targetCenter.y;
            const index = remaining.indexOf(target.dataset.dragId!) + Number(after);
            remaining.splice(index, 0, ...order.filter(id => itemIds.has(id)));
            if (remaining.some((id, index) => id !== order[index])) reorderedProducts[group] = remaining;
        }

        const renderedPositions = new Map<string, CategoryPosition>();
        for (const element of elements) {
            const id = element.dataset.categoryChunk;
            if (!id || renderedPositions.has(id)) continue;
            const lane = element.closest<HTMLElement>('[data-drag-column-container="category"]');
            const page = pages.find(candidate => candidate.element.contains(element));
            if (!lane || !page) continue;
            renderedPositions.set(id, { pageIndex: page.index, columnIndex: Number(lane.dataset.dragColumnIndex || 0),
                y: (element.getBoundingClientRect().top - page.rect.top) / page.scale });
        }
        const comparePosition = (a: CategoryPosition, b: CategoryPosition) => a.pageIndex - b.pageIndex
            || a.columnIndex - b.columnIndex || a.y - b.y;
        const newCategoryOrder = categoryOrder.filter(id => !categoryMoves.has(id));
        for (const [id, moved] of [...categoryMoves].sort(([, a], [, b]) => comparePosition(a, b))) {
            const next = newCategoryOrder.findIndex(candidate => {
                const position = categoryMoves.get(candidate) ?? renderedPositions.get(candidate);
                return position && comparePosition(moved, position) < 0;
            });
            newCategoryOrder.splice(next < 0 ? newCategoryOrder.length : next, 0, id);
        }

        if (!categoryMoves.size && !imageMoves.size && !backgroundMoves.size && !Object.keys(reorderedProducts).length) return;
        props.onStyleUpdate?.(previous => {
            const next: MenuStyle = { ...previous, name: 'Custom' };
            if (categoryMoves.size) {
                next.customCategoryOrder = newCategoryOrder;
                next.categoryPositions = { ...previous.categoryPositions, ...Object.fromEntries(categoryMoves) };
                next.categoryPlacements = {
                    ...previous.categoryPlacements,
                    ...Object.fromEntries([...categoryMoves].map(([id, { pageIndex, columnIndex }]) => [id, { pageIndex, columnIndex }])),
                };
            }
            if (imageMoves.size) next.addedImages = previous.addedImages?.map(image => {
                const position = imageMoves.get(image.id);
                return position ? { ...image, ...position, pageIndex: image.repeatAsBackground ? image.pageIndex : position.pageIndex } : image;
            });
            if (backgroundMoves.size && previous.freeTextBackgrounds) {
                next.freeTextBackgrounds = Object.fromEntries(Object.entries(previous.freeTextBackgrounds).map(([id, background]) =>
                    [id, { ...background, ...backgroundMoves.get(id) }]));
            }
            if (Object.keys(reorderedProducts).length) next.customProductOrder = { ...previous.customProductOrder, ...reorderedProducts };
            return next;
        });
    };

    return { move, restore, commit };
}

export type CanvasSelectionDrag = NonNullable<ReturnType<typeof createCanvasSelectionDrag>>;
