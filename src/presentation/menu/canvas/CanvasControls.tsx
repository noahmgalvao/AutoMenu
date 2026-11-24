import { createPortal } from 'react-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { FlowDirection } from './flowControls';
import { controlRail, placeCanvasControl, type ControlBox as Box } from './canvasControlPlacement';
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
const priority: Record<ControlKind, number> = { flow: 0, insert: 1, move: 2, page: 2, quick: 3, resize: 4 };
const pageControlObservers = new WeakMap<HTMLElement, ReturnType<typeof observeControls>>();

export const canvasActionButtonClass = 'automenu-canvas-action relative grid shrink-0 place-items-center text-slate-600 before:pointer-events-none before:absolute before:rounded-full before:border before:border-slate-200 before:bg-white before:shadow-sm hover:before:border-indigo-300 hover:before:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:outline-indigo-600';

const insetBounds = ({ left, right, top, bottom }: Box): Box => ({
    left: left + margin, right: right - margin, top: top + margin, bottom: bottom - margin,
});

function placeControls(
    page: HTMLElement, canvasElement: HTMLElement | null, zoomLayer: HTMLElement | null,
    obstacles: NodeListOf<HTMLElement> | undefined, controls: Set<Control>, railSides: WeakMap<HTMLElement, number>, expireHover: () => void,
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
    obstacles?.forEach(element => {
        if (element.getClientRects().length && getComputedStyle(element).visibility === 'visible') {
            blockers.push(element.getBoundingClientRect());
        }
    });
    document.querySelectorAll<HTMLElement>('[data-site-header], [data-mobile-designer-tab]').forEach(element => {
        if (element.getClientRects().length) blockers.push(element.getBoundingClientRect());
    });
    page.querySelectorAll('.automenu-image-resize-handle, [data-free-text-resize-handle]').forEach(handle => {
        blockers.push(handle.getBoundingClientRect());
    });

    const handles = Array.from(page.querySelectorAll('[data-canvas-transform-handle]'), handle => handle.getBoundingClientRect());
    const visible = canvas || pageBounds;
    const entries = active.map(control => ({ control, target: control.anchor.getBoundingClientRect() }));
    const rails = new Map<HTMLElement, ReturnType<typeof controlRail>>();
    for (const { control: { node, anchor, direction, kind, hoverOnly }, target } of entries) {
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

        if (kind === 'flow' || kind === 'insert') {
            const rail = rails.get(anchor) ?? controlRail(target, visible, railSides.get(anchor));
            rails.set(anchor, rail);
            const { edge, side } = rail;
            railSides.set(anchor, side);
            // Leave separate columns for move and insert even when the page edges are outside the viewport.
            const outerX = edge - width / 2 - side * 8;
            const moveX = Math.max(left, Math.min(right - width, outerX));
            x = kind === 'flow' ? moveX : moveX + side * (width + margin);
            if (kind === 'insert' && !entries.some(entry => entry.control.anchor === anchor && entry.control.kind === 'flow')) {
                x = outerX;
            }
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
            if (x < left - width / 2 || x > right - width / 2) {
                node.style.visibility = 'hidden';
                continue;
            }
            y = Math.min(y, target.top);
        } else if (direction === 'left' || direction === 'right') {
            x = direction === 'left' ? target.left - width - margin : target.right + margin;
        } else {
            if (kind === 'page' && direction === 'top') x = target.right - width - margin;
            y = direction === 'top' ? target.top - height - margin : target.bottom + margin;
        }

        const occupied = kind === 'quick' ? blockers : [...blockers, ...handles];
        const placement = placeCanvasControl(x, y, width, height, visible, kind === 'resize' ? [] : occupied, kind === 'quick');
        if (hoverOnly && (Math.abs(placement.top - y) > height || Math.abs(placement.left - x) > width / 2)) {
            node.style.visibility = 'hidden';
            continue;
        }
        if (kind !== 'resize') blockers.push(placement);

        const host = node.parentElement;
        const onScreen = host?.hasAttribute('data-canvas-control-overlay');
        const parent = onScreen && host ? host : (node.offsetParent as HTMLElement | null) || zoomLayer || anchor;
        const parentRect = parent.getBoundingClientRect();
        const controlScale = onScreen ? 1 : scale;
        const leftStyle = `${(Math.round(placement.left) - parentRect.left) / controlScale - parent.clientLeft}px`;
        const topStyle = `${(Math.round(placement.top) - parentRect.top) / controlScale - parent.clientTop}px`;
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
    const obstacles = canvas?.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-canvas-control-obstacle]');
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
            placeControls(page, canvas, zoomLayer, obstacles, controls, railSides, expireHover);
            if (zoomLayer?.getAnimations?.().some(animation => animation.playState === 'running')) update();
        });
    };
    const observer = new ResizeObserver(update);
    const mutations = new MutationObserver(records => {
        if (records.some(record => !(record.target instanceof Element && record.target.hasAttribute('data-canvas-action-group')))) update();
    });
    observer.observe(page);
    if (canvas) observer.observe(canvas);
    mutations.observe(frame, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    if (zoomLayer) mutations.observe(zoomLayer, { attributes: true, attributeFilter: ['style'] });
    if (canvas) mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    obstacles?.forEach(element => {
        observer.observe(element);
        mutations.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    const shortcutLayer = canvas?.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-control-overlay]')
        || frame.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-shortcuts]');
    shortcutLayer?.addEventListener('pointerover', update);
    shortcutLayer?.addEventListener('pointerout', update);
    frame.addEventListener('pointerover', update);
    frame.addEventListener('pointerout', update);
    frame.addEventListener('focusin', update);
    frame.addEventListener('focusout', update);
    const stopObservingScroll = observeAnchorScroll(page, update);
    window.addEventListener('resize', update);
    window.addEventListener('transitionend', update);
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
                window.removeEventListener('transitionend', update);
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
            style={{ visibility: 'hidden' }}
            onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            {children}
        </div>
    );

    return <>
        <span hidden ref={marker} aria-controls={props.id || groupId} data-canvas-action-anchor={kind} />
        {overlay ? createPortal(group, overlay) : group}
    </>;
}

export function CanvasFlowActions({ before, up, down, after }: {
    before?: React.ReactNode;
    up?: React.ReactNode;
    down?: React.ReactNode;
    after?: React.ReactNode;
}) {
    return <>
        {(up || down) && <CanvasActionGroup kind="flow" direction="left">
            {up && <div style={{ gridRow: 1 }}>{up}</div>}
            {down && <div style={{ gridRow: 2 }}>{down}</div>}
        </CanvasActionGroup>}
        {(before || after) && <CanvasActionGroup kind="insert" direction="left">
            {before && <div style={{ gridRow: 1 }}>{before}</div>}
            {after && <div style={{ gridRow: 2 }}>{after}</div>}
        </CanvasActionGroup>}
    </>;
}
