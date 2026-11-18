import React, { useLayoutEffect, useRef } from 'react';
import type { FlowDirection } from './flowControls';
import { getCanvasViewportBounds } from './canvasViewport';

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
    const hoverEnabled = matchMedia('(hover: hover) and (min-width: 768px)').matches;
    const time = performance.now();
    const active = [...controls].filter(control => {
        const { node, anchor, hoverOnly } = control;
        const hovered = hoverOnly && hoverEnabled && (anchor.matches(':hover') || node.contains(document.activeElement));
        if (hovered) control.lastHovered = time;
        const lingering = hoverOnly && hoverEnabled && !hovered && time - (control.lastHovered ?? -Infinity) < 180;
        if (lingering) expireHover();
        const show = !hoverOnly || hovered || lingering;
        node.style.visibility = show ? 'visible' : 'hidden';
        return show;
    }).sort((first, second) => Number(first.hoverOnly) - Number(second.hoverOnly) || priority[first.kind] - priority[second.kind]);
    if (!active.length) return;

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
        node.style.maxWidth = `${Math.max(0, bounds.right - bounds.left)}px`;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const centerX = (target.left + target.right) / 2;
        const centerY = (target.top + target.bottom) / 2;
        const side = direction === 'left' || direction === 'right';
        let x = centerX - width / 2;
        let y = centerY - height / 2;
        if (kind === 'quick') {
            if (target.width >= width) x = target.right - width;
            y = target.top - height - margin;
        } else if (kind === 'resize') {
            const column = anchor.closest('[data-drag-column-container]')?.getBoundingClientRect() || target;
            x = (direction === 'left' ? column.left : column.right) - width / 2;
            y = target.top - height - margin;
        } else if (side) {
            x = (direction === 'left' ? target.left : target.right) - width / 2;
        } else {
            y = (direction === 'top' ? target.top : target.bottom) - height / 2;
        }
        if (kind === 'add' || kind === 'move') {
            const paired = active.some(control => control.anchor === anchor && control.direction === direction
                && control.kind === (kind === 'add' ? 'move' : 'add'));
            if (paired) {
                const sign = kind === 'add' ? 1 : -1;
                if (side) y += sign * (height + margin) / 2;
                else x += sign * (width + margin) / 2;
            }
            if (direction === 'top') {
                const shortcuts = active.find(control => control.kind === 'quick' && control.anchor === anchor);
                if (shortcuts) {
                    const toolbarLeft = Math.min(target.right, bounds.right) - shortcuts.node.offsetWidth;
                    const lastSlot = toolbarLeft - margin - width;
                    const firstSlot = paired ? lastSlot - width - margin : lastSlot;
                    if (firstSlot >= Math.max(target.left, bounds.left)) {
                        x = Math.min(x, kind === 'move' ? firstSlot : lastSlot);
                        y = target.top - height / 2 - margin * 2;
                    }
                }
            }
            if (side ? x + width < bounds.left || x > bounds.right : y + height < bounds.top || y > bounds.bottom) {
                node.style.visibility = 'hidden';
                continue;
            }
        }

        // Only controls compete for space. Text in another row must never push a toolbar away from its object.
        const occupied = [...blockers];
        if (kind === 'resize') {
            const range = document.createRange();
            anchor.querySelectorAll('[data-word-fit]').forEach(text => {
                range.selectNodeContents(text);
                occupied.push(...Array.from(range.getClientRects()));
            });
        }
        const preferredLeft = clamp(x, bounds.left, bounds.right - width);
        const preferredTop = clamp(y, bounds.top, bounds.bottom - height);
        const xs = [preferredLeft, ...occupied.flatMap(box => [box.left - width - margin, box.right + margin])];
        const ys = [preferredTop, ...occupied.flatMap(box => [box.top - height - margin, box.bottom + margin])];
        let left = preferredLeft;
        let top = preferredTop;
        let bestScore = Infinity;
        for (const candidateX of xs) {
            const nextLeft = clamp(candidateX, bounds.left, bounds.right - width);
            for (const candidateY of ys) {
                const nextTop = clamp(candidateY, bounds.top, bounds.bottom - height);
                if (occupied.some(box => nextLeft < box.right && nextLeft + width > box.left
                    && nextTop < box.bottom && nextTop + height > box.top)) continue;
                const dx = nextLeft - preferredLeft;
                const dy = nextTop - preferredTop;
                const wrongEdge = kind === 'quick' ? nextTop > preferredTop + 1 || nextLeft > target.right || nextLeft + width < target.left
                    : direction === 'top' ? nextTop + height / 2 > centerY
                    : direction === 'bottom' ? nextTop + height / 2 < centerY
                    : direction === 'left' ? nextLeft + width / 2 > centerX : nextLeft + width / 2 < centerX;
                const score = dx * dx * (side ? 3 : 1) + dy * dy * (side ? 1 : 3) + (wrongEdge ? 10000 : 0);
                if (score < bestScore) {
                    bestScore = score;
                    left = nextLeft;
                    top = nextTop;
                }
            }
        }
        if (hoverOnly && (Math.abs(top - preferredTop) > margin || Math.abs(left - preferredLeft) > width / 2)) {
            node.style.visibility = 'hidden';
            continue;
        }
        blockers.push({ left, top, right: left + width, bottom: top + height });
        // Fixed positioning escapes the paper clip when controls need space around the page.
        const inPaper = left >= pageRect.left && left + width <= pageRect.right
            && top >= pageRect.top && top + height <= pageRect.bottom;
        node.style.position = inPaper ? 'absolute' : 'fixed';
        const parent = inPaper ? (node.offsetParent as HTMLElement | null) || anchor : zoomLayer;
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
    frame.addEventListener('pointerover', update);
    frame.addEventListener('pointerout', update);
    frame.addEventListener('focusin', update);
    frame.addEventListener('focusout', update);
    window.addEventListener('scroll', update, true);
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
                frame.removeEventListener('pointerover', update);
                frame.removeEventListener('pointerout', update);
                frame.removeEventListener('focusin', update);
                frame.removeEventListener('focusout', update);
                window.removeEventListener('scroll', update, true);
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
    useLayoutEffect(() => {
        const node = ref.current;
        const frame = node?.closest<HTMLElement>('[data-menu-page-frame]');
        const page = frame?.querySelector<HTMLElement>(':scope > [data-menu-print-page]');
        const anchor = anchorId ? document.getElementById(anchorId)
            : anchorSelector ? node?.closest<HTMLElement>(anchorSelector) : node?.parentElement;
        if (!node || !frame || !page || !anchor) return;
        let coordinator = pageControlObservers.get(frame);
        if (!coordinator) {
            coordinator = observeControls(frame, page);
            pageControlObservers.set(frame, coordinator);
        }
        return coordinator.add({ node, anchor, direction, kind, hoverOnly });
    }, [anchorId, anchorSelector, direction, hoverOnly, kind]);
    return (
        <div {...props} ref={ref} data-canvas-action-group={kind} data-canvas-action-direction={direction} data-selected-control={hoverOnly ? undefined : 'true'}
            data-drag-ignore="true" data-print-control="true"
            className={`pointer-events-auto absolute z-[80] flex w-max min-w-min origin-top-left flex-wrap items-center gap-1 ${className}`}
            style={{ visibility: 'hidden' }}
            onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            {children}
        </div>
    );
}
