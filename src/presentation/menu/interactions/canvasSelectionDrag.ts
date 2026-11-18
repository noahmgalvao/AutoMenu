import type { SelectionItem } from './types';

export type CanvasItem = SelectionItem & { type: 'product' | 'freeText' | 'category' | 'addedImage' };

export const isDraggableSelectionItem = (item: SelectionItem): item is CanvasItem =>
    item.type === 'product' || item.type === 'freeText' || item.type === 'category' || item.type === 'addedImage';

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
