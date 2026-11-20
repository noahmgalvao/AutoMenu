import { createPortal } from 'react-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { FlowDirection } from './flowControls';
import { getCanvasViewportBounds, observeAnchorScroll } from './canvasViewport';

type ControlKind = 'quick' | 'add' | 'move' | 'resize';
type Box = Record<'left' | 'right' | 'top' | 'bottom', number>;
type Control = {
    node: HTMLDivElement;
    anchor: HTMLElement;
    direction: FlowDirection;
    kind: ControlKind;
    hoverOnly: boolean;
    lastHovered?: number;
};

const margin = 4;
const edgeOffset = 10;
const priority: Record<ControlKind, number> = { add: 0, move: 1, quick: 2, resize: 3 };
const pageControlObservers = new WeakMap<HTMLElement, ReturnType<typeof observeControls>>();

export const canvasActionButtonClass = 'automenu-canvas-action relative grid shrink-0 place-items-center text-slate-600 before:pointer-events-none before:absolute before:rounded-full before:border before:border-slate-200 before:bg-white before:shadow-sm hover:before:border-indigo-300 hover:before:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:outline-indigo-600';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const insetBounds = ({ left, right, top, bottom }: Box): Box => ({
    left: left + margin, right: right - margin, top: top + margin, bottom: bottom - margin,
});

function placeControls(
    page: HTMLElement, canvasElement: HTMLElement | null, zoomLayer: HTMLElement | null,
    obstacles: NodeListOf<HTMLElement> | undefined, controls: Set<Control>, expireHover: () => void,
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
    page.querySelectorAll('.automenu-image-resize-handle, [data-free-text-resize-handle]').forEach(handle => {
        blockers.push(handle.getBoundingClientRect());
    });

    for (const { node, anchor, direction, kind, hoverOnly } of active) {
        const target = anchor.getBoundingClientRect();
        const bounds = canvas || pageBounds;
        if (target.bottom < bounds.top || target.top > bounds.bottom || target.right < bounds.left || target.left > bounds.right) {
            node.style.visibility = 'hidden';
            continue;
        }
        node.style.visibility = 'visible';
        node.style.maxWidth = `${Math.max(0, bounds.right - bounds.left)}px`;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const centerX = (target.left + target.right) / 2;
        const centerY = (target.top + target.bottom) / 2;
        const side = direction === 'left' || direction === 'right';
        const leading = direction === 'left' || direction === 'top';
        const edge = side ? (leading ? target.left : target.right) : (leading ? target.top : target.bottom);
        let x = centerX - width / 2;
        let y = centerY - height / 2;

        if (kind === 'quick') {
            x = target.right - width;
            y = target.top - height - margin;
        } else if (kind === 'resize') {
            const column = anchor.closest('[data-drag-column-container="category"]');
            const neighbor = leading ? column?.previousElementSibling : column?.nextElementSibling;
            if (!column || !neighbor?.matches('[data-drag-column-container="category"]')) {
                node.style.visibility = 'hidden';
                continue;
            }
            const columnRect = column.getBoundingClientRect();
            const neighborRect = neighbor.getBoundingClientRect();
            const divider = leading ? (neighborRect.right + columnRect.left) / 2 : (columnRect.right + neighborRect.left) / 2;
            if (divider < bounds.left - margin || divider > bounds.right + margin) {
                node.style.visibility = 'hidden';
                continue;
            }
            x = divider - width / 2;
            y = Math.min(centerY - height / 2, target.top);
        } else {
            const edgeMin = side ? bounds.left : bounds.top;
            const edgeMax = side ? bounds.right : bounds.bottom;
            if (edge < edgeMin - margin || edge > edgeMax + margin) {
                node.style.visibility = 'hidden';
                continue;
            }
            const center = edge + (leading ? -edgeOffset : edgeOffset);
            if (side) x = center - width / 2;
            else y = center - height / 2;
            const paired = active.some(control => control.anchor === anchor && control.direction === direction
                && control.kind === (kind === 'add' ? 'move' : 'add'));
            if (paired) {
                const sign = kind === 'add' ? 1 : -1;
                if (side) y += sign * (height + margin) / 2;
                else x += sign * (width + margin) / 2;
            }
            if (direction === 'top') {
                const shortcuts = active.find(control => control.kind === 'quick' && !control.hoverOnly
                    && (control.anchor === anchor || anchor.contains(control.anchor)));
                if (shortcuts) {
                    const lastSlot = Math.min(target.right, bounds.right) - shortcuts.node.offsetWidth - width - margin;
                    const firstSlot = paired ? lastSlot - width - margin : lastSlot;
                    if (firstSlot >= Math.max(target.left, bounds.left)) {
                        x = kind === 'move' ? firstSlot : lastSlot;
                    }
                }
            }
        }

        // Resolve collisions along the same edge first. A narrow target can borrow the space immediately beside it.
        const directional = kind === 'add' || kind === 'move';
        const edgeLeft = side && directional && !leading ? edge - width / 2 : bounds.left;
        const edgeRight = side && directional && leading ? edge + width / 2 : bounds.right;
        const edgeTop = !side && directional && !leading ? edge - height / 2 : bounds.top;
        const edgeBottom = !side && directional && leading ? edge + height / 2 : bounds.bottom;
        // At the viewport rim the button can be clipped, but its center stays on the intended side.
        const minimumLeft = Math.min(bounds.left, edgeRight - width);
        const maximumLeft = Math.max(bounds.right - width, edgeLeft);
        const minimumTop = Math.min(bounds.top, edgeBottom - height);
        const maximumTop = Math.max(bounds.bottom - height, edgeTop);
        const preferredLeft = kind === 'resize' ? x : clamp(x, minimumLeft, maximumLeft);
        const preferredTop = clamp(y, minimumTop, maximumTop);
        const slidesHorizontally = !side || kind === 'quick';
        const minLeft = Math.max(minimumLeft, slidesHorizontally ? Math.min(preferredLeft, target.left - width) - width / 2
            : preferredLeft - (leading ? edgeOffset : 0));
        const maxLeft = Math.min(maximumLeft, slidesHorizontally ? Math.max(preferredLeft, target.right) + width / 2
            : preferredLeft + (leading ? 0 : edgeOffset));
        const minTop = Math.max(minimumTop, side ? Math.min(preferredTop, target.top - height) - height / 2
            : preferredTop - (kind === 'quick' ? height + margin : leading ? edgeOffset : 0));
        const maxTop = Math.min(maximumTop, side ? Math.max(preferredTop, target.bottom) + height / 2
            : preferredTop + (kind !== 'quick' && !leading ? edgeOffset : 0));
        const occupied = [...blockers];
        if (kind === 'resize') {
            const range = document.createRange();
            anchor.querySelectorAll('[data-word-fit]').forEach(text => {
                range.selectNodeContents(text);
                occupied.push(...Array.from(range.getClientRects()));
            });
        }
        const xs = kind === 'resize' ? [preferredLeft] : [
            preferredLeft, ...occupied.flatMap(box => [box.left - width, box.right]),
        ].map(value => clamp(value, minLeft, maxLeft));
        const ys = [preferredTop, ...occupied.flatMap(box => [box.top - height, box.bottom])]
            .map(value => clamp(value, minTop, maxTop));
        let left = preferredLeft;
        let top = preferredTop;
        let bestOverlap = Infinity;
        let bestDistance = Infinity;
        for (const nextLeft of xs) {
            for (const nextTop of ys) {
                const overlap = occupied.reduce((total, box) => total
                    + Math.max(0, Math.min(nextLeft + width, box.right) - Math.max(nextLeft, box.left))
                    * Math.max(0, Math.min(nextTop + height, box.bottom) - Math.max(nextTop, box.top)), 0);
                const dx = nextLeft - preferredLeft;
                const dy = nextTop - preferredTop;
                const distance = dx * dx * (side ? 16 : 1) + dy * dy * (side ? 1 : kind === 'quick' ? 4 : 16);
                if (overlap < bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
                    bestOverlap = overlap;
                    bestDistance = distance;
                    left = nextLeft;
                    top = nextTop;
                }
            }
        }
        if (hoverOnly && (bestOverlap > 0 || Math.abs(top - preferredTop) > margin || Math.abs(left - preferredLeft) > width / 2)) {
            node.style.visibility = 'hidden';
            continue;
        }
        blockers.push({ left, top, right: left + width, bottom: top + height });
        // Fixed positioning escapes the paper clip when controls need space around the page.
        const inPaper = left >= pageRect.left && left + width <= pageRect.right
            && top >= pageRect.top && top + height <= pageRect.bottom;
        const inOverlay = node.parentElement?.hasAttribute('data-canvas-shortcuts');
        node.style.position = inPaper || inOverlay ? 'absolute' : 'fixed';
        const parent = inPaper || inOverlay ? (node.offsetParent as HTMLElement | null) || anchor : zoomLayer;
        const parentRect = parent?.getBoundingClientRect();
        node.style.left = `${(left - (parentRect?.left ?? 0)) / scale - (parent?.clientLeft ?? 0)}px`;
        node.style.top = `${(top - (parentRect?.top ?? 0)) / scale - (parent?.clientTop ?? 0)}px`;
        node.style.transform = `scale(${1 / scale})`;
    }
}

function observeControls(frame: HTMLElement, page: HTMLElement) {
    const controls = new Set<Control>();
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
            placeControls(page, canvas, zoomLayer, obstacles, controls, expireHover);
            if (zoomLayer?.getAnimations().some(animation => animation.playState === 'running')) update();
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
    const shortcutLayer = frame.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-shortcuts]');
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
        const host = kind === 'quick' ? frame.parentElement?.querySelector<HTMLElement>(':scope > [data-canvas-shortcuts]') : null;
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
        <div {...props} id={kind === 'quick' ? groupId : props.id} ref={ref} data-canvas-action-group={kind} data-canvas-action-direction={direction} data-selected-control={hoverOnly ? undefined : 'true'}
            data-drag-ignore="true" data-print-control="true"
            className={`pointer-events-auto absolute z-[80] flex w-max min-w-min origin-top-left flex-wrap items-center gap-1 ${className}`}
            style={{ visibility: 'hidden' }}
            onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            {children}
        </div>
    );
    if (kind !== 'quick') return group;
    return <>
        <span hidden ref={marker} aria-controls={groupId} data-canvas-action-anchor={kind} />
        {overlay ? createPortal(group, overlay) : group}
    </>;
}
