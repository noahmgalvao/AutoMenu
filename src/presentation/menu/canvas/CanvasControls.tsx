import React, { useLayoutEffect, useRef } from 'react';
import type { FlowDirection } from './flowControls';
import { getCanvasViewportBounds } from './canvasViewport';

type ControlKind = 'quick' | 'add' | 'move' | 'resize';
type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
type Control = {
    node: HTMLDivElement;
    anchor: HTMLElement;
    direction: FlowDirection;
    kind: ControlKind;
    hoverOnly: boolean;
    lastHovered?: number;
};

const margin = 4;
const priority: Record<ControlKind, number> = { add: 0, quick: 1, resize: 2, move: 3 };
const pageControlObservers = new WeakMap<HTMLElement, ReturnType<typeof observeControls>>();

export const canvasActionButtonClass = 'grid size-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 md:size-10';

function placeControls(frame: HTMLElement, page: HTMLElement, controls: Set<Control>, expireHover: () => void) {
    const pageRect = page.getBoundingClientRect();
    const scale = pageRect.width / page.offsetWidth;
    if (!scale) return;
    const canvasElement = frame.closest<HTMLElement>('[data-automenu-editor-canvas]');
    const canvas = canvasElement && getCanvasViewportBounds(canvasElement);
    const zoomLayer = frame.closest<HTMLElement>('[data-canvas-zoom-layer]');
    const pageBounds = { left: pageRect.left + margin, top: pageRect.top + margin, right: pageRect.right - margin, bottom: pageRect.bottom - margin };
    const visible = canvas && {
        left: Math.max(pageBounds.left, canvas.left + margin),
        right: Math.min(pageBounds.right, canvas.right - margin),
        top: Math.max(pageBounds.top, canvas.top + margin),
        bottom: Math.min(pageBounds.bottom, canvas.bottom - margin),
    };
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
    }).sort((first, second) => priority[first.kind] - priority[second.kind]);
    if (!active.length) return;

    const blockers: Box[] = [];
    const range = document.createRange();
    page.querySelectorAll<HTMLElement>(
        '[data-word-fit], [data-menu-marker], [data-border-text], [data-page-number], .automenu-image-resize-handle, [data-free-text-resize-handle]',
    ).forEach(element => {
        if (!element.getClientRects().length || getComputedStyle(element).opacity === '0') return;
        if (element.textContent?.trim()) {
            range.selectNodeContents(element);
            blockers.push(...Array.from(range.getClientRects()).filter(rect => rect.width && rect.height));
        } else {
            const rect = element.getBoundingClientRect();
            if (rect.width && rect.height) blockers.push(rect);
        }
    });

    let dockedHeight = 0;
    const availableWidth = canvas ? canvas.right - canvas.left : window.innerWidth;
    for (const { node, anchor, direction, kind } of active) {
        const target = anchor.getBoundingClientRect();
        const sizeRatio = Math.min(1, Math.max(1, availableWidth - margin * 2) / Math.max(1, node.offsetWidth));
        const width = node.offsetWidth * sizeRatio;
        const height = node.offsetHeight * sizeRatio;
        const targetVisible = visible && target.right >= visible.left && target.left <= visible.right
            && target.bottom >= visible.top && target.top <= visible.bottom;
        const bounds = targetVisible && visible.right - visible.left >= width && visible.bottom - visible.top >= height ? visible : pageBounds;
        const centerX = (target.left + target.right) / 2;
        const centerY = (target.top + target.bottom) / 2;
        const side = direction === 'left' || direction === 'right';
        const preferred = {
            x: direction === 'left' ? target.left - width - margin : direction === 'right' ? target.right + margin
                : kind === 'quick' ? target.right - width : centerX - width / 2,
            y: direction === 'top' ? target.top - height - margin : direction === 'bottom' ? target.bottom + margin : centerY - height / 2,
        };
        if (kind === 'resize') {
            const column = anchor.closest('[data-drag-column-container]')?.getBoundingClientRect() || target;
            preferred.x = (direction === 'left' ? column.left : column.right) - width / 2;
            preferred.y = target.top - height - margin;
        }

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
        const coordinates = (values: number[], center: number, min: number, max: number) => (
            [...new Set([center, min, max, ...values].map(value => clamp(value, min, max)))]
                .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
        );
        const findSpace = (area: Box) => {
            if (area.right - area.left < width || area.bottom - area.top < height) return;
            const xPositions = coordinates(blockers.flatMap(box => [box.left - width - margin, box.right + margin]),
                preferred.x, area.left, area.right - width);
            const yPositions = coordinates(blockers.flatMap(box => [box.top - height - margin, box.bottom + margin]),
                preferred.y, area.top, area.bottom - height);
            let best: { left: number; top: number; score: number } | undefined;
            for (const left of xPositions) {
                const horizontalDistance = Math.abs(left - preferred.x);
                if (best && horizontalDistance >= best.score) break;
                const horizontalBlockers = blockers.filter(box => left < box.right + 1 && left + width > box.left - 1);
                for (const top of yPositions) {
                    const distance = horizontalDistance + Math.abs(top - preferred.y);
                    if (best && distance >= best.score) break;
                    if (horizontalBlockers.some(box => top < box.bottom + 1 && top + height > box.top - 1)) continue;
                    const atPreferredEdge = side
                        ? (direction === 'left' ? left + width <= target.left + margin : left >= target.right - margin)
                        : (direction === 'top' ? top + height <= target.top + margin : top >= target.bottom - margin);
                    const score = distance + (kind === 'add' && !atPreferredEdge ? 80 : 0);
                    if (!best || score < best.score) best = { left, top, score };
                }
            }
            return best;
        };
        const best = findSpace(bounds) || (bounds !== pageBounds ? findSpace(pageBounds) : undefined);
        const dockLeft = canvas && targetVisible
            ? clamp(preferred.x, canvas.left + margin, canvas.right - width - margin)
            : Math.max(pageBounds.left, preferred.x);
        const left = best?.left ?? dockLeft;
        const top = best?.top ?? (pageRect.bottom + margin + dockedHeight);
        if (!best) dockedHeight += height + margin;
        blockers.push({ left, top, right: left + width, bottom: top + height });
        // A fixed control uses the zoom layer as its containing block, outside the paper clip.
        node.style.position = best ? 'absolute' : 'fixed';
        const parent = best ? (node.offsetParent as HTMLElement | null) || anchor : zoomLayer;
        const parentRect = parent?.getBoundingClientRect();
        node.style.left = `${(left - (parentRect?.left ?? 0)) / scale - (parent?.clientLeft ?? 0)}px`;
        node.style.top = `${(top - (parentRect?.top ?? 0)) / scale - (parent?.clientTop ?? 0)}px`;
        node.style.transform = `scale(${sizeRatio / scale})`;
    }
}

function observeControls(frame: HTMLElement, page: HTMLElement) {
    const controls = new Set<Control>();
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
            placeControls(frame, page, controls, expireHover);
        });
    };
    const observer = new ResizeObserver(update);
    const mutations = new MutationObserver(records => {
        if (records.some(record => !(record.target instanceof Element && record.target.hasAttribute('data-canvas-action-group')))) update();
    });
    observer.observe(page);
    mutations.observe(frame, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    frame.addEventListener('pointerover', update);
    frame.addEventListener('pointerout', update);
    frame.addEventListener('focusin', update);
    frame.addEventListener('focusout', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.addEventListener('transitionend', update);
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
        <div {...props} ref={ref} data-canvas-action-group={kind} data-canvas-action-direction={direction}
            data-drag-ignore="true" data-print-control="true"
            className={`pointer-events-auto absolute z-[80] flex w-max origin-top-left flex-nowrap items-center gap-1 ${className}`}
            style={{ visibility: 'hidden' }}
            onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            {children}
        </div>
    );
}
