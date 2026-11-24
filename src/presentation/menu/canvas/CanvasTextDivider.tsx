import { useLayoutEffect, useRef } from 'react';
import type { CategoryDividerStyle } from '../../../domain/menu/model';
import { getCategoryDividerStyle } from './categoryDividers';

function getTextEdge(text: HTMLElement, edge: 'first' | 'last') {
    const walker = text.ownerDocument.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let node = edge === 'first' ? walker.firstChild() : walker.lastChild();
    while (node) {
        const content = node.textContent || '';
        const index = edge === 'first' ? content.search(/\S/) : content.trimEnd().length - 1;
        if (index >= 0) {
            const range = text.ownerDocument.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            const rect = range.getBoundingClientRect();
            if (rect.height) return rect;
        }
        node = edge === 'first' ? walker.nextNode() : walker.previousNode();
    }
    return null;
}

function positionSegment(segment: HTMLElement, row: DOMRect, scale: number, left: number, right: number, y: number) {
    const height = segment.offsetHeight;
    segment.style.visibility = right - left >= scale ? 'visible' : 'hidden';
    segment.style.width = `${Math.max(0, (right - left) / scale)}px`;
    segment.style.left = `${(left - row.left) / scale}px`;
    segment.style.top = `${(y - row.top) / scale - height / 2}px`;
}

export function CanvasTextDivider({ preset, color, titleEdge, product = false }: {
    preset: CategoryDividerStyle;
    color: string;
    titleEdge: 'left' | 'right';
    product?: boolean;
}) {
    const slotRef = useRef<HTMLSpanElement>(null);
    const lineRef = useRef<HTMLSpanElement>(null);
    const continuationRef = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        const slot = slotRef.current;
        const line = lineRef.current;
        const continuation = continuationRef.current;
        const row = slot?.parentElement;
        const text = row?.querySelector<HTMLElement>('[data-divider-title]');
        const price = product ? row?.querySelector<HTMLElement>('[data-template-price]') : null;
        const priceText = price?.querySelector<HTMLElement>('[data-price-value]');
        if (!row || !slot || !text || !line || preset === 'none') return;

        let frame = 0;
        const update = () => {
            frame = 0;
            const heading = getTextEdge(text, titleEdge === 'left' ? 'last' : 'first');
            if (!heading || !row.offsetWidth) {
                line.style.visibility = 'hidden';
                if (continuation) continuation.style.visibility = 'hidden';
                return;
            }
            const bounds = row.getBoundingClientRect();
            const scale = bounds.width / row.offsetWidth || 1;
            const gap = (parseFloat(getComputedStyle(row).columnGap) || (product ? 0 : 4)) * scale;
            const slotBounds = slot.getBoundingClientRect();
            const titleCenter = heading.top + heading.height / 2;
            if (!price || !continuation) {
                const left = titleEdge === 'left' ? heading.right + gap : slotBounds.left;
                const right = titleEdge === 'left' ? slotBounds.right : heading.left - gap;
                positionSegment(line, bounds, scale, left, right, titleCenter);
                return;
            }

            const priceBounds = price.getBoundingClientRect();
            const priceStart = price.querySelector<HTMLElement>('[data-price-symbol]') || priceText;
            const priceGlyph = priceStart && getTextEdge(priceStart, 'first');
            const priceCenter = priceGlyph ? priceGlyph.top + priceGlyph.height / 2 : priceBounds.top + priceBounds.height / 2;
            const wrapped = priceBounds.top >= text.getBoundingClientRect().bottom - scale;
            positionSegment(line, bounds, scale, heading.right + gap, wrapped ? bounds.right : priceBounds.left - gap, titleCenter);
            if (wrapped) positionSegment(continuation, bounds, scale, bounds.left, priceBounds.left - gap, priceCenter);
            else continuation.style.visibility = 'hidden';
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const resize = new ResizeObserver(schedule);
        [row, slot, text, price, priceText].forEach(node => { if (node) resize.observe(node); });
        const mutations = new MutationObserver(schedule);
        const textOptions: MutationObserverInit = {
            subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'],
        };
        mutations.observe(text, textOptions);
        if (price) mutations.observe(price, textOptions);
        mutations.observe(row, { attributes: true, attributeFilter: ['data-price-wrap', 'style'] });
        document.fonts?.addEventListener('loadingdone', schedule);
        update();
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            mutations.disconnect();
            document.fonts?.removeEventListener('loadingdone', schedule);
        };
    }, [preset, product, titleEdge]);

    const segmentStyle = {
        ...getCategoryDividerStyle(preset, color, titleEdge),
        position: 'absolute', width: 0, visibility: 'hidden',
    } as const;
    return (
        <span ref={slotRef} aria-hidden="true" className={product ? 'pointer-events-none absolute inset-0' : 'pointer-events-none min-w-0 grow'}>
            {preset !== 'none' && <span ref={lineRef} data-divider-segment="start" data-menu-divider-color={color}
                data-ornamental-divider={preset === 'ornamental' ? titleEdge : undefined} style={segmentStyle} />}
            {product && <span ref={continuationRef} data-divider-segment="continuation" style={segmentStyle} />}
        </span>
    );
}
