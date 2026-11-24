import { createPortal } from 'react-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { FlowDirection } from './flowControls';
import { getObjectControlBox, controlBoxContains, controlBoxesOverlap, placeCanvasControl, type ControlBox as Box } from './canvasControlPlacement';
import { getCanvasViewportBounds, observeAnchorScroll } from './canvasViewport';

type ControlKind = 'quick' | 'flow' | 'insert' | 'move' | 'page' | 'resize';
type Control = {
    node: HTMLDivElement;
    anchor: HTMLElement;
    direction: FlowDirection;
    kind: ControlKind;
    hoverOnly: boolean;
    lastHovered?: number;
};

const margin = 4;
const priority: Record<ControlKind, number> = { resize: 0, insert: 1, flow: 2, move: 2, page: 2, quick: 3 };
const pageControlObservers = new WeakMap<HTMLElement, ReturnType<typeof observeControls>>();

export const canvasActionButtonClass = 'automenu-canvas-action relative grid shrink-0 place-items-center text-slate-600 before:pointer-events-none before:absolute before:rounded-full before:border before:border-slate-200 before:bg-white before:shadow-sm hover:before:border-indigo-300 hover:before:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:outline-indigo-600';

const insetBounds = ({ left, right, top, bottom }: Box): Box => ({
    left: left + margin, right: right - margin, top: top + margin, bottom: bottom - margin,
});

function placeControls(
    page: HTMLElement, canvasElement: HTMLElement | null, zoomLayer: HTMLElement | null,
    container: HTMLElement | null, controls: Set<Control>, expireHover: () => void,
) {
    const hoverEnabled = matchMedia('(hover: hover) and (min-width: 768px)').matches;
    const time = performance.now();
    const active = [...controls].filter(control => {
        const { node, anchor, hoverOnly } = control;
        const hovered = hoverOnly && hoverEnabled && (anchor.matches(':hover') || node.matches(':hover') || node.contains(document.activeElement));
        if (hovered) control.lastHovered = time;
        const lingering = hoverOnly && hoverEnabled && !hovered && time - (control.lastHovered ?? -Infinity) < 180;
        if (lingering) expireHover();
        const show = !hoverOnly || hovered || lingering;
        if (!show && node.style.visibility !== 'hidden') node.style.visibility = 'hidden';
        return show;
    }).sort((first, second) => Number(first.hoverOnly) - Number(second.hoverOnly) || priority[first.kind] - priority[second.kind]);
    if (!active.length) return;
    const pageRect = page.getBoundingClientRect();
    const scale = pageRect.width / page.offsetWidth;
    if (!scale) return;
    const canvasRect = canvasElement?.getBoundingClientRect();
    const canvas = canvasElement && canvasRect && insetBounds(getCanvasViewportBounds(canvasElement));
    if (canvas && canvasElement && canvasRect) {
        canvas.right = Math.min(canvas.right, canvasRect.left + canvasElement.clientLeft + canvasElement.clientWidth - margin);
        canvas.bottom = Math.min(canvas.bottom, canvasRect.top + canvasElement.clientTop + canvasElement.clientHeight - margin);
    }
    const pageBounds = insetBounds(pageRect);

    const blockers: Box[] = [];
    container?.querySelectorAll<HTMLElement>(':scope > [data-canvas-control-obstacle], [data-fixed-canvas-tip]').forEach(element => {
        if (element.getClientRects().length && getComputedStyle(element).visibility === 'visible') blockers.push(element.getBoundingClientRect());
    });
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    if (header) {
        const { left, right } = header.getBoundingClientRect();
        blockers.push({ left, right, top: 0, bottom: Math.max(0, header.getBoundingClientRect().bottom) });
    }
    const tabs = document.querySelector<HTMLElement>('[data-mobile-designer-tab]')?.parentElement;
    if (tabs?.offsetHeight) {
        const { left, right } = tabs.getBoundingClientRect();
        blockers.push({ left, right, top: window.innerHeight - tabs.offsetHeight, bottom: window.innerHeight });
    }
    page.querySelectorAll('.automenu-image-resize-handle, [data-free-text-resize-handle]').forEach(handle => {
        blockers.push(handle.getBoundingClientRect());
    });

    const handles = Array.from(page.querySelectorAll('[data-canvas-transform-handle]'), handle => handle.getBoundingClientRect());
    const categoryTitles = Array.from(page.querySelectorAll('[id^="category-header-"]'), title => title.getBoundingClientRect());
    const visible = canvas || pageBounds;
    for (const { node, anchor, direction, kind, hoverOnly } of active) {
        const target = anchor.getBoundingClientRect();
        const { left, right, top, bottom } = visible;
        const reject = () => { if (node.style.visibility !== 'hidden') node.style.visibility = 'hidden'; };
        if (kind !== 'resize' && (target.bottom < top || target.top > bottom || target.right < left || target.left > right)) {
            reject();
            continue;
        }
        const maxWidth = `${Math.max(0, right - left)}px`;
        if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        if (!width || !height) continue;

        const isClear = (box: Box) => controlBoxContains(visible, box)
            && blockers.every(blocker => !controlBoxesOverlap(box, blocker));
        let placement: Box | undefined;

        if (kind === 'quick') {
            const occupied = [...blockers, ...categoryTitles];
            for (const y of [target.top - height - 6, target.bottom + 6]) {
                if (y < top || y + height > bottom) continue;
                const band = { left, right, top: y, bottom: y + height };
                const x = target.right - width;
                const candidate = placeCanvasControl(x, y, width, height, band, occupied, true);
                if (isClear(candidate) && occupied.every(box => !controlBoxesOverlap(candidate, box))
                    && (!hoverOnly || Math.abs(candidate.left - x) <= width / 2)) {
                    placement = candidate;
                    break;
                }
            }
        } else if (kind === 'resize') {
            const column = anchor.closest('[data-drag-column-container="category"]');
            const neighbor = direction === 'left' ? column?.previousElementSibling : column?.nextElementSibling;
            if (!column || !neighbor?.matches('[data-drag-column-container="category"]')) {
                reject();
                continue;
            }
            const columnRect = column.getBoundingClientRect();
            const neighborRect = neighbor.getBoundingClientRect();
            const divider = direction === 'left' ? (neighborRect.right + columnRect.left) / 2
                : (columnRect.right + neighborRect.left) / 2;
            const x = divider - width / 2;
            const y = Math.max(top, columnRect.top) + 4;
            const limit = Math.min(bottom, columnRect.bottom, y + height * 3);
            if (x >= left && x + width <= right && y + height <= limit) {
                const candidate = placeCanvasControl(x, y, width, height,
                    { left: x, right: x + width, top: y, bottom: limit }, [...blockers, ...handles], false);
                if (isClear(candidate) && handles.every(box => !controlBoxesOverlap(candidate, box))) placement = candidate;
            }
        } else if (kind !== 'page') {
            const candidate = getObjectControlBox(target, kind, direction, width, height);
            if (isClear(candidate)) placement = candidate;
        }

        if (!placement) {
            reject();
            continue;
        }
        blockers.push(placement);

        const host = node.parentElement;
        const onScreen = host?.hasAttribute('data-canvas-control-overlay');
        const parent = onScreen && host ? host : (node.offsetParent as HTMLElement | null) || zoomLayer || anchor;
        const parentRect = parent.getBoundingClientRect();
        const controlScale = onScreen ? 1 : scale;
        const leftStyle = `${Math.round(placement.left - parentRect.left) / controlScale - parent.clientLeft}px`;
        const topStyle = `${Math.round(placement.top - parentRect.top) / controlScale - parent.clientTop}px`;
        if (node.style.left !== leftStyle) node.style.left = leftStyle;
        if (node.style.top !== topStyle) node.style.top = topStyle;
        const transform = onScreen ? '' : `scale(${1 / scale})`;
        if (node.style.transform !== transform) node.style.transform = transform;
        if (node.style.visibility !== 'visible') node.style.visibility = 'visible';
    }
}

function observeControls(frame: HTMLElement, page: HTMLElement) {
    const controls = new Set<Control>();
    const canvas = frame.closest<HTMLElement>('[data-automenu-editor-canvas]');
    const zoomLayer = frame.closest<HTMLElement>('[data-canvas-zoom-layer]');
    const container = canvas?.parentElement ?? null;
    const obstacles = container?.querySelectorAll<HTMLElement>(':scope > [data-canvas-control-obstacle]');
    const viewport = window.visualViewport;
    let pending = 0;
    let hoverTimer: number | undefined;
    const expireHover = () => {
        hoverTimer ??= window.setTimeout(() => {
            hoverTimer = undefined;
            update();
        }, 180);
    };
    const update = () => {
        if (pending || container?.hasAttribute('data-canvas-zooming')) return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            if (container?.hasAttribute('data-canvas-zooming')) return;
            placeControls(page, canvas, zoomLayer, container, controls, expireHover);
        });
    };
    const observer = new ResizeObserver(update);
    const mutations = new MutationObserver(records => {
        if (records.some(record => !(record.target instanceof Element && record.target.hasAttribute('data-canvas-action-group')))) update();
    });
    observer.observe(page);
    if (canvas) observer.observe(canvas);
    mutations.observe(frame, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    if (container) {
        mutations.observe(container, { childList: true, attributes: true, attributeFilter: ['data-canvas-zooming'] });
    }
    if (zoomLayer) mutations.observe(zoomLayer, { attributes: true, attributeFilter: ['style'] });
    if (canvas) mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    obstacles?.forEach(element => {
        observer.observe(element);
        mutations.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    const shortcutLayer = container?.querySelector<HTMLElement>(':scope > [data-canvas-control-overlay]')
        || frame.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-shortcuts]');
    shortcutLayer?.addEventListener('pointerover', update);
    shortcutLayer?.addEventListener('pointerout', update);
    frame.addEventListener('pointerover', update);
    frame.addEventListener('pointerout', update);
    frame.addEventListener('focusin', update);
    frame.addEventListener('focusout', update);
    const stopObservingScroll = observeAnchorScroll(page, update);
    window.addEventListener('resize', update);
    frame.addEventListener('transitionend', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return {
        add(control: Control) {
            controls.add(control);
            observer.observe(control.node);
            observer.observe(control.anchor);
            update();
            return () => {
                controls.delete(control);
                observer.unobserve(control.node);
                if (![...controls].some(entry => entry.anchor === control.anchor)) observer.unobserve(control.anchor);
                if (controls.size) { update(); return; }
                cancelAnimationFrame(pending);
                window.clearTimeout(hoverTimer);
                observer.disconnect();
                mutations.disconnect();
                shortcutLayer?.removeEventListener('pointerover', update);
                shortcutLayer?.removeEventListener('pointerout', update);
                frame.removeEventListener('pointerover', update);
                frame.removeEventListener('pointerout', update);
                frame.removeEventListener('focusin', update);
                frame.removeEventListener('focusout', update);
                stopObservingScroll();
                window.removeEventListener('resize', update);
                frame.removeEventListener('transitionend', update);
                viewport?.removeEventListener('resize', update);
                viewport?.removeEventListener('scroll', update);
                pageControlObservers.delete(frame);
            };
        },
    };
}

export function CanvasActionGroup({ direction, kind, anchorId, anchorSelector, hoverOnly = false, className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement> & {
    direction: FlowDirection;
    kind: ControlKind;
    anchorId?: string;
    anchorSelector?: string;
    hoverOnly?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const marker = useRef<HTMLSpanElement>(null);
    const [overlay, setOverlay] = useState<HTMLElement | null>(null);
    const groupId = React.useId();
    useLayoutEffect(() => {
        if (kind === 'page') return;
        const origin = marker.current ?? ref.current;
        const frame = origin?.closest<HTMLElement>('[data-menu-page-frame]');
        const page = frame?.querySelector<HTMLElement>(':scope > [data-menu-print-page]');
        const anchor = anchorId ? document.getElementById(anchorId)
            : anchorSelector ? origin?.closest<HTMLElement>(anchorSelector) : origin?.parentElement;
        if (!frame || !page || !anchor) return;
        const host = frame.closest('[data-automenu-editor-canvas]')?.parentElement
            ?.querySelector<HTMLElement>(':scope > [data-canvas-control-overlay]')
            || frame.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-shortcuts]');
        if (host && host !== overlay) { setOverlay(host); return; }
        const node = ref.current;
        if (!node) return;
        if (overlay) node.dataset.shortcutPage = page.dataset.pageIndex;
        let coordinator = pageControlObservers.get(frame);
        if (!coordinator) {
            coordinator = observeControls(frame, page);
            pageControlObservers.set(frame, coordinator);
        }
        return coordinator.add({ node, anchor, direction, kind, hoverOnly });
    }, [anchorId, anchorSelector, direction, hoverOnly, kind, overlay]);
    const group = (
        <div {...props} id={props.id || groupId} ref={ref} data-canvas-action-group={kind} data-canvas-action-direction={direction} data-selected-control={hoverOnly ? undefined : 'true'}
            data-drag-ignore="true" data-print-control="true"
            className={`pointer-events-auto absolute z-[80] flex w-max min-w-min origin-top-left flex-wrap items-center gap-1 ${className}`}
            style={kind === 'page' ? undefined : { visibility: 'hidden' }}
            onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            {children}
        </div>
    );

    return <>
        <span hidden ref={marker} aria-controls={props.id || groupId} data-canvas-action-anchor={kind} />
        {overlay ? createPortal(group, overlay) : group}
    </>;
}

export function CanvasFlowActions({ before, up, down, after, beforeDirection = 'top', afterDirection = 'bottom' }: {
    before?: React.ReactNode;
    up?: React.ReactNode;
    down?: React.ReactNode;
    after?: React.ReactNode;
    beforeDirection?: FlowDirection;
    afterDirection?: FlowDirection;
}) {
    return <>
        {up && <CanvasActionGroup kind="flow" direction="top">{up}</CanvasActionGroup>}
        {down && <CanvasActionGroup kind="flow" direction="bottom">{down}</CanvasActionGroup>}
        {before && <CanvasActionGroup kind="insert" direction={beforeDirection}>{before}</CanvasActionGroup>}
        {after && <CanvasActionGroup kind="insert" direction={afterDirection}>{after}</CanvasActionGroup>}
    </>;
}
