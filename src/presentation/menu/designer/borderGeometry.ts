import type { BorderBox, BorderGeometry, SideSpace } from '../../../domain/menu/borderFitting';
import type { MenuBorderSide } from '../../../domain/menu/model';

type TextBounds = { element: Element; box: BorderBox };

const textSelector = '[data-word-fit], [data-menu-marker], [data-border-text], [data-page-number]';

const gap = 2;

function measureText(page: HTMLElement): TextBounds[] {
    const range = document.createRange();
    return Array.from(page.querySelectorAll(textSelector)).flatMap((element) => {
        const css = getComputedStyle(element);
        if (css.visibility === 'hidden' || Number(css.opacity) === 0) return [];
        if (element.matches('[data-subtitle-placeholder]:empty, img[data-menu-marker]') && element.getBoundingClientRect().height > 0) {
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
