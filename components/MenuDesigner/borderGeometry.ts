import type { MenuBorder, MenuBorderSide } from '../../types';

type BorderBox = Pick<DOMRectReadOnly, 'top' | 'right' | 'bottom' | 'left'>;
type TextBounds = { element: Element; box: BorderBox };
type SideSpace = { inner: number; outer: number };
type Limits = readonly [number, number];

export type BorderGeometry = {
    width: number;
    height: number;
    enclosesSurface: boolean;
    cardShape?: string;
    textBounds: BorderBox[];
    space: Record<MenuBorderSide, SideSpace>;
};

const textSelector = '[data-word-fit], [data-menu-marker], [data-border-text], [data-page-number]';
const sideIds: MenuBorderSide[] = ['top', 'right', 'bottom', 'left'];
const gap = 2;

function measureText(page: HTMLElement): TextBounds[] {
    const range = document.createRange();
    return Array.from(page.querySelectorAll(textSelector)).flatMap((element) => {
        const css = getComputedStyle(element);
        if (css.visibility === 'hidden' || Number(css.opacity) === 0) return [];
        if (element.matches('[data-subtitle-placeholder]:empty') && element.getBoundingClientRect().height > 0) {
            return [{ element, box: element.getBoundingClientRect() }];
        }
        range.selectNodeContents(element);
        return Array.from(range.getClientRects())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => ({ element, box }));
    });
}

function measureGeometry(surface: HTMLElement, page: HTMLElement, entries: TextBounds[]): BorderGeometry {
    const box = surface.getBoundingClientRect();
    const pageBox = page.getBoundingClientRect();
    const scale = pageBox.width / Number(page.dataset.menuPageWidthPx) || 1;
    const width = Math.round(box.width / scale * 100) / 100;
    const height = Math.round(box.height / scale * 100) / 100;
    const isCard = surface.hasAttribute('data-product-card-surface');
    const enclosesSurface = isCard || surface.dataset.menuBorderSurface === 'productImage';
    const maxOutset = Math.min(64, Math.max(4, Math.round(Math.min(width, height) / 2)));
    const ownText = entries.filter(({ element }) => surface.contains(element)).map(({ box }) => box);
    const neighbors = entries.filter(({ element }) => !surface.contains(element)).map(({ box }) => box);
    if (isCard) {
        page.querySelectorAll('[data-product-card-surface]').forEach((card) => {
            if (card !== surface) neighbors.push(card.getBoundingClientRect());
        });
    }
    const clip = { top: pageBox.top, right: pageBox.right, bottom: pageBox.bottom, left: pageBox.left };
    for (let element: HTMLElement | null = surface; element && element !== page; element = element.parentElement) {
        const css = getComputedStyle(element);
        if (/hidden|clip/.test(css.overflowX)) {
            const bounds = element.getBoundingClientRect();
            clip.left = Math.max(clip.left, bounds.left);
            clip.right = Math.min(clip.right, bounds.right);
        }
        if (/hidden|clip/.test(css.overflowY)) {
            const bounds = element.getBoundingClientRect();
            clip.top = Math.max(clip.top, bounds.top);
            clip.bottom = Math.min(clip.bottom, bounds.bottom);
        }
    }
    const getSpace = (side: MenuBorderSide, crossStart: 'left' | 'top', crossEnd: 'right' | 'bottom',
        nearEdge: MenuBorderSide, farEdge: MenuBorderSide, direction: 1 | -1): SideSpace => {
        const distance = (edge: number) => (edge - box[side]) * direction / scale;
        const inner = ownText.length ? Math.max(...ownText.map((own) => distance(own[side]))) + gap
            : -Math.min(12, Math.min(width, height) / 8);
        let outer = Math.min(maxOutset, distance(clip[side]));
        for (const neighbor of neighbors) {
            const near = distance(neighbor[nearEdge]);
            const crossAllowance = (near >= 0 ? maxOutset + gap : gap) * scale;
            if (neighbor[crossEnd] <= box[crossStart] - crossAllowance ||
                neighbor[crossStart] >= box[crossEnd] + crossAllowance ||
                distance(neighbor[farEdge]) + gap <= inner) continue;
            outer = Math.min(outer, near - gap);
        }
        return { inner: enclosesSurface ? Math.min(-12, Math.floor(outer) - 12) : Math.ceil(inner), outer: Math.floor(outer) };
    };
    const textBounds = ownText.map((rect) => ({
        top: (rect.top - box.top) / scale,
        right: (rect.right - box.left) / scale,
        bottom: (rect.bottom - box.top) / scale,
        left: (rect.left - box.left) / scale,
    }));
    return { width, height, enclosesSurface, cardShape: surface.dataset.productCardShape, textBounds, space: {
        top: getSpace('top', 'left', 'right', 'bottom', 'top', -1),
        right: getSpace('right', 'top', 'bottom', 'left', 'right', 1),
        bottom: getSpace('bottom', 'left', 'right', 'top', 'bottom', 1),
        left: getSpace('left', 'top', 'bottom', 'right', 'left', -1),
    } };
}

type GeometryListener = (geometry: BorderGeometry) => void;
type PageMeasurements = {
    surfaces: Map<HTMLElement, Set<GeometryListener>>;
    schedule: () => void;
    dispose: () => void;
};

const measurements = new WeakMap<HTMLElement, PageMeasurements>();

function watchPage(page: HTMLElement): PageMeasurements {
    const surfaces: PageMeasurements['surfaces'] = new Map();
    let frame = 0;
    const observed = new Set<Element>();
    const measure = () => {
        frame = 0;
        const targets = new Set<Element>([page, ...surfaces.keys(), ...page.querySelectorAll(textSelector)]);
        observed.forEach((element) => { if (!targets.has(element)) resize.unobserve(element); });
        targets.forEach((element) => { if (!observed.has(element)) resize.observe(element); });
        observed.clear();
        targets.forEach((element) => observed.add(element));
        const entries = measureText(page);
        for (const [surface, listeners] of surfaces) {
            const geometry = measureGeometry(surface, page, entries);
            listeners.forEach((listener) => listener(geometry));
        }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver((records) => {
        if (records.some(({ target }) => !(target instanceof Element && target.matches('[data-menu-border]')))) schedule();
    });
    mutation.observe(page, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    return { surfaces, schedule, dispose: () => {
        resize.disconnect();
        mutation.disconnect();
        cancelAnimationFrame(frame);
    } };
}

export function observeBorderGeometry(surface: HTMLElement, listener: GeometryListener) {
    const page = surface.closest<HTMLElement>('[data-menu-page-width-px]');
    if (!page) return;
    let observer = measurements.get(page);
    if (!observer) {
        observer = watchPage(page);
        measurements.set(page, observer);
    }
    const listeners = observer.surfaces.get(surface) || new Set();
    observer.surfaces.set(surface, listeners);
    listeners.add(listener);
    observer.schedule();
    return () => {
        listeners.delete(listener);
        if (!listeners.size) observer!.surfaces.delete(surface);
        if (!observer!.surfaces.size) {
            observer!.dispose();
            measurements.delete(page);
        }
    };
}

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
