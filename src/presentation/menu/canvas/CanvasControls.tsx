import { createPortal } from 'react-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { FlowDirection } from './flowControls';
import { controlRail, controlBoxesOverlap, placeCanvasControl, type ControlBox as Box } from './canvasControlPlacement';
import { getCanvasViewportBounds, observeAnchorScroll } from './canvasViewport';

type ControlKind = 'quick' | 'flow' | 'insert' | 'move' | 'page' | 'resize';
type Control = {
    node: HTMLDivElement;
    anchor: HTMLElement;
    direction: FlowDirection;
    kind: ControlKind;
    hoverOnly: boolean;
    grouped: boolean;
    lastHovered?: number;
    lastOffset?: { x: number; y: number };
};

const margin = 4;
const priority: Record<ControlKind, number> = { flow: 0, insert: 1, move: 2, page: 2, resize: 3, quick: 4 };
const pageControlObservers = new WeakMap<HTMLElement, ReturnType<typeof observeControls>>();

export const canvasActionButtonClass = 'automenu-canvas-action relative grid shrink-0 place-items-center text-slate-600 before:pointer-events-none before:absolute before:rounded-full before:border before:border-slate-200 before:bg-white before:shadow-sm hover:before:border-indigo-300 hover:before:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:outline-indigo-600';

const insetBounds = ({ left, right, top, bottom }: Box): Box => ({
    left: left + margin, right: right - margin, top: top + margin, bottom: bottom - margin,
});

function placeControls(
    page: HTMLElement, canvasElement: HTMLElement | null, zoomLayer: HTMLElement | null,
    container: HTMLElement | null, controls: Set<Control>, railSides: WeakMap<HTMLElement, number>, expireHover: () => void,
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
        blockers.push({ left, right, top: 0, bottom: header.offsetHeight });
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
    const visible = canvas || pageBounds;
    const rails = new Map<HTMLElement, ReturnType<typeof controlRail>>();
    for (const control of active) {
        const { node, anchor, direction, kind, hoverOnly, lastOffset, grouped } = control;
        const target = anchor.getBoundingClientRect();
        const { left, right, top, bottom } = visible;
        if (target.bottom < top || target.top > bottom || target.right < left || target.left > right) {
            node.style.visibility = 'hidden';
            continue;
        }
        const maxWidth = `${Math.max(0, right - left)}px`;
        if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
        if (!node.offsetWidth || !node.offsetHeight) continue;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const centerX = (target.left + target.right) / 2;
        const centerY = (target.top + target.bottom) / 2;
        let x = centerX - width / 2;
        let y = centerY - height / 2;

        if (kind === 'flow' || (kind === 'insert' && direction === 'left')) {
            const railAnchor = grouped ? anchor.closest<HTMLElement>('[data-drag-column-container="category"]') ?? anchor : anchor;
            const rail = rails.get(railAnchor) ?? controlRail(railAnchor === anchor ? target : railAnchor.getBoundingClientRect(), visible, railSides.get(railAnchor));
            rails.set(railAnchor, rail);
            const { edge, side } = rail;
            railSides.set(railAnchor, side);
            // Leave separate columns for move and insert even when the page edges are outside the viewport.
            const outerX = edge - width / 2 - side * 8;
            const moveX = Math.max(left, Math.min(right - width, outerX));
            x = kind === 'flow' ? moveX : moveX + side * (width + margin);
            if (kind === 'insert' && !grouped && !active.some(entry => entry.anchor === anchor && entry.kind === 'flow')) {
                x = outerX;
            }
        } else if (kind === 'insert') {
            x = target.left;
            y = direction === 'top' ? target.top - height - margin : target.bottom + margin;
        } else if (kind === 'quick') {
            x = target.right - width;
            y = target.top - height - 8;
        } else if (kind === 'resize') {
            const column = anchor.closest('[data-drag-column-container="category"]');
            const neighbor = direction === 'left' ? column?.previousElementSibling : column?.nextElementSibling;
            if (!column || !neighbor?.matches('[data-drag-column-container="category"]')) {
                node.style.visibility = 'hidden';
                continue;
            }
            const columnRect = column.getBoundingClientRect();
            const neighborRect = neighbor.getBoundingClientRect();
            x = (direction === 'left' ? (neighborRect.right + columnRect.left) / 2
                : (columnRect.right + neighborRect.left) / 2) - width / 2;
            y = Math.min(y, target.top);
        } else if (direction === 'left' || direction === 'right') {
            x = direction === 'left' ? target.left - width - margin : target.right + margin;
        } else {
            y = direction === 'top' ? target.top - height - margin : target.bottom + margin;
        }

        const occupied = [...blockers, ...handles];
        let boundary = visible;
        if (kind === 'insert' && direction === 'top' && target.top - visible.top >= height + margin) {
            boundary = { ...visible, bottom: target.top - margin };
        } else if (kind === 'insert' && direction === 'bottom' && visible.bottom - target.bottom >= height + margin) {
            boundary = { ...visible, top: target.bottom + margin };
        } else if (kind === 'resize' && x >= left && x + width <= right) {
            const divider = { ...visible, left: x, right: x + width };
            const alongDivider = placeCanvasControl(x, y, width, height, divider, occupied, false, lastOffset);
            if (occupied.every(box => !controlBoxesOverlap(box, alongDivider))) boundary = divider;
        }
        if (kind === 'insert' && grouped) {
            const lane = Math.max(boundary.left, Math.min(boundary.right - width, x));
            const aligned = { ...boundary, left: lane, right: lane + width };
            const onRail = placeCanvasControl(x, y, width, height, aligned, occupied, true, lastOffset);
            if (occupied.every(box => !controlBoxesOverlap(box, onRail))) boundary = aligned;
        }
        const placement = placeCanvasControl(x, y, width, height, boundary, occupied, kind === 'quick', lastOffset);
        if (hoverOnly && (Math.abs(placement.top - y) > height || Math.abs(placement.left - x) > width / 2)) {
            node.style.visibility = 'hidden';
            continue;
        }
        control.lastOffset = { x: placement.left - x, y: placement.top - y };
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
    const railSides = new WeakMap<HTMLElement, number>();
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
        if (pending) return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            if (container?.hasAttribute('data-canvas-zooming')) {
                controls.forEach(({ node }) => { node.style.visibility = 'hidden'; });
                return;
            }
            placeControls(page, canvas, zoomLayer, container, controls, railSides, expireHover);
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
    const shortcutLayer = canvas?.querySelector<HTMLElement>('[data-canvas-control-overlay]')
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

export function CanvasActionGroup({ direction, kind, anchorId, anchorSelector, hoverOnly = false, grouped = false, className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement> & {
    direction: FlowDirection;
    kind: ControlKind;
    anchorId?: string;
    anchorSelector?: string;
    hoverOnly?: boolean;
    grouped?: boolean;
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
        const host = frame.closest('[data-automenu-editor-canvas]')
            ?.querySelector<HTMLElement>('[data-canvas-control-overlay]')
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
        return coordinator.add({ node, anchor, direction, kind, hoverOnly, grouped });
    }, [anchorId, anchorSelector, direction, grouped, hoverOnly, kind, overlay]);
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

export function CanvasFlowActions({ before, up, down, after, aroundCategory = false, grouped = false }: {
    before?: React.ReactNode;
    aroundCategory?: boolean;
    grouped?: boolean;
    up?: React.ReactNode;
    down?: React.ReactNode;
    after?: React.ReactNode;
}) {
    return <>
        {(up || down) && <CanvasActionGroup kind="flow" direction="left" grouped={grouped} data-single-flow-slot={grouped && !(up && down) || undefined}>
            {up && <div style={{ gridRow: 1 }}>{up}</div>}
            {down && <div style={{ gridRow: grouped && !up ? 1 : 2 }}>{down}</div>}
        </CanvasActionGroup>}
        {aroundCategory ? <>
            {before && <CanvasActionGroup kind="insert" direction="top" grouped={grouped}>{before}</CanvasActionGroup>}
            {after && <CanvasActionGroup kind="insert" direction="bottom" grouped={grouped}>{after}</CanvasActionGroup>}
        </> : (before || after) && <CanvasActionGroup kind="insert" direction="left" grouped={grouped} data-single-flow-slot={grouped && !(before && after) || undefined}>
            {before && <div style={{ gridRow: 1 }}>{before}</div>}
            {after && <div style={{ gridRow: grouped && !before ? 1 : 2 }}>{after}</div>}
        </CanvasActionGroup>}
    </>;
}
