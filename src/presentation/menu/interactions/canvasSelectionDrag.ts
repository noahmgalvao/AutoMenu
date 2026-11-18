import type { SelectionItem } from './types';

export type CanvasItem = SelectionItem & { type: 'product' | 'freeText' | 'category' | 'addedImage' };

export const isDraggableSelectionItem = (item: SelectionItem): item is CanvasItem =>
    item.type === 'product' || item.type === 'freeText' || item.type === 'category' || item.type === 'addedImage';

export function keepSelectedOrder(order: string[], id: string, insertionIndex: number, isSelected: (id: string) => boolean) {
    const index = order.indexOf(id);
    if (index < 0) return insertionIndex;

    const previous = order.slice(0, index).map(isSelected).lastIndexOf(true);
    const next = order.findIndex((candidate, candidateIndex) => candidateIndex > index && isSelected(candidate));
    return Math.max(previous + 1, Math.min(insertionIndex, next === -1 ? order.length - 1 : next - 1));
}

export function moveSelectedProducts(
    initialOrder: string[], currentOrder: string[], selectedIds: ReadonlySet<string>, anchorId: string, insertionIndex: number,
) {
    const others = initialOrder.filter(id => !selectedIds.has(id));
    const anchorGap = initialOrder.slice(0, initialOrder.indexOf(anchorId)).filter(id => !selectedIds.has(id)).length;
    const destinationGap = currentOrder.filter(id => id !== anchorId).slice(0, insertionIndex)
        .filter(id => !selectedIds.has(id)).length;
    const offset = destinationGap - anchorGap;
    const slots = Array.from({ length: others.length + 1 }, () => [] as string[]);
    let gap = 0;
    for (const id of initialOrder) {
        if (selectedIds.has(id)) {
            slots[Math.max(0, Math.min(others.length, gap + offset))].push(id);
        } else {
            gap++;
        }
    }
    return slots.flatMap((slot, index) => index < others.length ? [...slot, others[index]] : slot);
}

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
