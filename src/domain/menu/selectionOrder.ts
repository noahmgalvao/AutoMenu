export function getContiguousRangeStart<T>(order: readonly T[], selected: ReadonlySet<T>) {
    if (!selected.size) return -1;
    const first = order.findIndex(item => selected.has(item));
    if (first < 0 || first + selected.size > order.length) return -1;
    return order.slice(first, first + selected.size).every(item => selected.has(item)) ? first : -1;
}

export function moveContiguousSelection(
    order: readonly string[], visibleOrder: readonly string[], selected: ReadonlySet<string>, before: boolean,
) {
    const first = getContiguousRangeStart(visibleOrder, selected);
    if (first < 0) return null;
    const neighbor = visibleOrder[before ? first - 1 : first + selected.size];
    if (neighbor === undefined) return order;
    const next = order.filter(id => !selected.has(id));
    const neighborIndex = next.indexOf(neighbor);
    next.splice(neighborIndex + (before ? 0 : 1), 0, ...visibleOrder.slice(first, first + selected.size));
    return next;
}
