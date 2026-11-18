import type { MenuBorderSide, MenuBorder } from './model';

export type BorderBox = { top: number; right: number; bottom: number; left: number };

export type SideSpace = { inner: number; outer: number };

type Limits = readonly [number, number];

export type BorderGeometry = {
    width: number;
    height: number;
    enclosesSurface: boolean;
    cardShape?: string;
    textBounds: BorderBox[];
    space: Record<MenuBorderSide, SideSpace>;
};

const sideIds: MenuBorderSide[] = ['top', 'right', 'bottom', 'left'];

const clamp = (value: number, [min, max]: Limits) => Math.max(min, Math.min(max, value));

function getSafeRadius(
    geometry: BorderGeometry, sides: MenuBorderSide[], outsets: Record<MenuBorderSide, number>, thickness: number,
    offset: number, length: number,
) {
    const left = -outsets.left;
    const right = geometry.width + outsets.right;
    const top = -outsets.top;
    const bottom = geometry.height + outsets.bottom;
    const limit = Math.max(0, Math.floor(Math.min(right - left, bottom - top) / 2));
    if (length < 100 || !sides.length || !geometry.textBounds.length) return limit;

    const corners = (['top', 'bottom'] as const).flatMap(vertical => (['left', 'right'] as const).map(horizontal => ({
        horizontal,
        vertical,
        x: horizontal === 'left' ? left : right,
        y: vertical === 'top' ? top : bottom,
        strokeX: sides.includes(horizontal) ? thickness : 0,
        strokeY: sides.includes(vertical) ? thickness : 0,
    }))).filter(({ strokeX, strokeY }) => strokeX || strokeY);
    const text = geometry.textBounds.filter(rect => rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom);
    const fits = (radius: number) => corners.every(({ horizontal, vertical, x, y, strokeX, strokeY }) => {
        // CSS rounds inward only near the corners. The straight edges keep their own clearance.
        const cardRadius = geometry.cardShape && radius ? Math.max(0, radius + offset) : radius;
        const outerRadius = Math.min(limit, geometry.cardShape === 'arch' && vertical === 'bottom' ? Math.round(cardRadius / 4) : cardRadius);
        if (!outerRadius) return true;
        return text.every(rect => {
            const dx = horizontal === 'left' ? rect.left - x : x - rect.right;
            const dy = vertical === 'top' ? rect.top - y : y - rect.bottom;
            if (dx >= outerRadius || dy >= outerRadius) return true;
            const arcX = (outerRadius - dx + 0.5) / Math.max(0.5, outerRadius - strokeX);
            const arcY = (outerRadius - dy + 0.5) / Math.max(0.5, outerRadius - strokeY);
            return arcX * arcX + arcY * arcY <= 1;
        });
    });
    let low = 0;
    let high = limit;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(middle)) low = middle;
        else high = middle - 1;
    }
    return low;
}

export function fitBorder(border: MenuBorder, geometry: BorderGeometry) {
    const { width, height, space } = geometry;
    const activeSides = border.sides.length ? border.sides : sideIds;
    const safeSides = activeSides.filter((side) => space[side].outer - space[side].inner >= 1);
    const shortEdge = Math.min(width, height);
    const thickness: Limits = [1, Math.max(1, Math.min(12, Math.floor(shortEdge / 5),
        ...safeSides.map((side) => space[side].outer - space[side].inner)))];
    const fittedThickness = clamp(border.thickness, thickness);
    const distances = safeSides.map((side) => ({ min: space[side].inner + fittedThickness, max: space[side].outer }));
    const farthest = Math.min(...distances.map(({ max }) => max));
    const nearest = Math.max(...distances.filter(({ min }) => min <= farthest).map(({ min }) => min));
    const offset: Limits = distances.length ? [nearest, farthest] : [0, 0];
    const fittedOffset = clamp(border.offset, offset);
    const outsets = Object.fromEntries(sideIds.map((side) => [side, safeSides.includes(side)
        ? clamp(fittedOffset, [space[side].inner + fittedThickness, space[side].outer])
        : clamp(fittedOffset, [0, Math.max(0, space[side].outer)])])) as Record<MenuBorderSide, number>;
    const length: Limits = [Math.min(100, Math.max(5, Math.ceil(300 * fittedThickness / Math.max(1, shortEdge)))), 100];
    const fittedLength = clamp(border.length, length);
    const radius: Limits = [0, getSafeRadius(geometry, safeSides, outsets, fittedThickness, fittedOffset, fittedLength)];
    return {
        outsets,
        limits: { thickness, length, radius, offset },
        border: { ...border, sides: border.sides.filter((side) => safeSides.includes(side)),
            thickness: fittedThickness, length: fittedLength, radius: clamp(border.radius, radius), offset: fittedOffset },
    };
}
