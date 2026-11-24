export type ControlBox = { left: number; right: number; top: number; bottom: number };

export const clampControl = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const controlBoxesOverlap = (a: ControlBox, b: ControlBox, gap = 0) =>
    a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

const boxAt = (left: number, top: number, width: number, height: number): ControlBox =>
    ({ left, top, right: left + width, bottom: top + height });

export function controlRail(anchor: ControlBox, viewport: ControlBox, previousSide?: number) {
    if (anchor.left >= viewport.left + (previousSide === -1 ? 6 : -2)) return { edge: anchor.left, side: 1 };
    if (anchor.right <= viewport.right + 2) return { edge: anchor.right, side: -1 };
    return { edge: viewport.left + 4, side: 1 };
}

export function placeCanvasControl(
    x: number, y: number, width: number, height: number,
    boundary: ControlBox, occupied: ControlBox[], verticalPriority: boolean,
    previousOffset?: { x: number; y: number },
) {
    const x1 = Math.max(boundary.left, boundary.right - width);
    const y1 = Math.max(boundary.top, boundary.bottom - height);
    const preferredX = clampControl(x, boundary.left, x1);
    const preferredY = clampControl(y, boundary.top, y1);
    const preferred = boxAt(preferredX, preferredY, width, height);
    const gap = 3;
    if (previousOffset && (previousOffset.x || previousOffset.y)) {
        const previous = boxAt(x + previousOffset.x, y + previousOffset.y, width, height);
        const inside = previous.left >= boundary.left && previous.right <= boundary.right
            && previous.top >= boundary.top && previous.bottom <= boundary.bottom;
        const preferredHasRoom = preferredX === x && preferredY === y
            && occupied.every(box => !controlBoxesOverlap(box, preferred, gap + 8));
        if (!preferredHasRoom && inside && occupied.every(box => !controlBoxesOverlap(box, previous))) return previous;
    }
    if (occupied.every(box => !controlBoxesOverlap(box, preferred, gap))) return preferred;

    const xs = new Set([preferredX, boundary.left, x1]);
    const ys = new Set([preferredY, boundary.top, y1]);
    for (const box of occupied) {
        xs.add(clampControl(box.left - width - gap, boundary.left, x1));
        xs.add(clampControl(box.right + gap, boundary.left, x1));
        ys.add(clampControl(box.top - height - gap, boundary.top, y1));
        ys.add(clampControl(box.bottom + gap, boundary.top, y1));
    }
    let best = preferred;
    let bestOverlap = Infinity;
    let bestDistance = Infinity;
    for (const left of xs) {
        for (const top of ys) {
            const candidate = boxAt(left, top, width, height);
            const overlap = occupied.reduce((total, box) => total
                + Math.max(0, Math.min(candidate.right, box.right + gap) - Math.max(candidate.left, box.left - gap))
                * Math.max(0, Math.min(candidate.bottom, box.bottom + gap) - Math.max(candidate.top, box.top - gap)), 0);
            const distance = (left - preferredX) ** 2 * (verticalPriority ? 4 : 1) + (top - preferredY) ** 2;
            if (overlap < bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
                best = candidate;
                bestOverlap = overlap;
                bestDistance = distance;
            }
        }
    }
    return best;
}
