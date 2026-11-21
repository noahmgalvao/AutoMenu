import { hasMenuContentMutation } from './menuContentMutations';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { MenuStyle } from '../../../domain/menu/model';
import { measureRenderedText } from './textFit';

const px = (value: string) => parseFloat(value) || 0;

const largestPriceSize = (width: number, minimum: number, base: number, measure: (size: number) => number) => {
    if (measure(base) <= width) return base;
    if (measure(minimum) > width) return null;
    let lower = minimum;
    let upper = base;
    while (upper - lower >= 2) {
        const middle = Math.floor((lower + upper) / 2);
        if (measure(middle) <= width) lower = middle;
        else upper = middle;
    }
    return lower;
};

function measurePriceRow(row: HTMLElement) {
    const title = row.querySelector<HTMLElement>('[data-divider-title]');
    const price = row.querySelector<HTMLElement>('[data-template-price]');
    const value = price?.querySelector<HTMLElement>('[data-price-value]');
    if (!title || !price || !value || !row.clientWidth) return null;

    const symbol = price.querySelector<HTMLElement>('[data-price-symbol]')?.innerText ?? '';
    const amount = value.innerText;
    const priceCss = getComputedStyle(price);
    const titleCss = getComputedStyle(title);
    const base = Number(price.dataset.priceBaseSize);
    const minimum = Math.min(base, Number(price.dataset.priceMinimumSize));
    const priceInset = px(priceCss.borderLeftWidth) + px(priceCss.borderRightWidth)
        + px(priceCss.paddingLeft) + px(priceCss.paddingRight) + (symbol ? px(priceCss.columnGap) : 0);
    const measurePrice = (size: number) => measureRenderedText(amount, size, priceCss)
        + measureRenderedText(symbol, size, priceCss) + priceInset;

    const titleGroup = title.parentElement;
    const marker = titleGroup?.querySelector<HTMLElement>('[data-menu-marker]');
    const markerWidth = marker && titleGroup ? marker.offsetWidth + px(getComputedStyle(titleGroup).columnGap) : 0;
    const nameWidth = measureRenderedText(title.innerText, px(titleCss.fontSize), titleCss) + markerWidth;
    const rowGap = px(getComputedStyle(row).columnGap);
    const dividerGap = row.hasAttribute('data-product-leader') ? rowGap : 0;
    const inlineWidth = row.clientWidth - nameWidth - rowGap - dividerGap;
    const fit = largestPriceSize(inlineWidth, minimum, base, measurePrice);
    return { row, price, base, minimum, fit, measurePrice };
}

function measureWrappedPriceSpace(row: HTMLElement, slot: HTMLElement | null) {
    const flow = row.closest<HTMLElement>('[data-product-flow][data-photo-flow="left"], [data-product-flow][data-photo-flow="right"]');
    const photo = flow?.querySelector<HTMLElement>(':scope > [data-template-image]');
    if (!photo || !slot) return { left: 0, right: 0 };
    const bounds = row.getBoundingClientRect();
    if (slot.getBoundingClientRect().top + .5 < photo.getBoundingClientRect().bottom) return { left: 0, right: 0 };
    const container = row.parentElement!.getBoundingClientRect();
    const scale = bounds.width / row.offsetWidth || 1;
    const padding = getComputedStyle(row.parentElement!);
    return {
        left: Math.max(0, (bounds.left - container.left) / scale - px(padding.paddingLeft)),
        right: Math.max(0, (container.right - bounds.right) / scale - px(padding.paddingRight)),
    };
}

export function useResponsivePrices(rootRef: RefObject<HTMLElement | null>, style: MenuStyle) {
    const refresh = useRef<() => void>(undefined);
    const [name, price] = [style.elementStyles.productName, style.elementStyles.productPrice];
    const textMetrics = JSON.stringify([
        style.fontFamily, style.minimumFontSize, style.fontSizeLimits,
        style.design?.price, style.productPhotoAlignments, price?.textAlign,
        name?.fontFamily, name?.fontWeight, name?.italic, name?.fontSize, name?.textTransform, name?.letterSpacing,
        price?.fontFamily, price?.fontWeight, price?.italic, price?.fontSize,
    ]);
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let frame = 0;
        const observed = new Set<HTMLElement>();
        const sizes = new WeakMap<HTMLElement, string>();
        const measure = () => {
            frame = 0;
            const rows = new Set(root.querySelectorAll<HTMLElement>('[data-product-text-row]'));
            for (const row of observed) {
                if (rows.has(row)) continue;
                resize.unobserve(row);
                observed.delete(row);
            }
            const metrics = Array.from(rows, row => {
                if (!observed.has(row)) {
                    resize.observe(row);
                    observed.add(row);
                }
                const metric = measurePriceRow(row);
                if (!metric && !row.querySelector('[data-template-price]')) row.removeAttribute('data-price-wrap');
                return metric;
            }).filter(metric => metric !== null);

            // Compare against the configured size on each pass so a wider column can restore it.
            const sharedSize = metrics.reduce((size, metric) => Math.min(size, metric.fit ?? Infinity), Infinity);
            for (const { row, price, base, minimum, fit, measurePrice } of metrics) {
                const wrapped = fit === null;
                row.toggleAttribute('data-price-wrap', wrapped);
                const slot = price.closest<HTMLElement>('[data-product-price-slot]');
                const { left, right } = wrapped ? measureWrappedPriceSpace(row, slot) : { left: 0, right: 0 };
                slot?.style.setProperty('--automenu-price-left', `${left}px`);
                slot?.style.setProperty('--automenu-price-right', `${right}px`);
                const wrappedSize = wrapped ? largestPriceSize(row.clientWidth + left + right, minimum, base, measurePrice) : base;
                price.toggleAttribute('data-price-stacked', wrappedSize === null);
                const size = fit === null ? wrappedSize ?? minimum : sharedSize;
                const fitted = size < base ? `${size}px` : '';
                if (price.style.getPropertyValue('--automenu-fitted-price-size') !== fitted) {
                    price.style.setProperty('--automenu-fitted-price-size', fitted);
                }
            }
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
        const resize = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (!(entry.target instanceof HTMLElement)) continue;
                const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
                if (size === sizes.get(entry.target)) continue;
                sizes.set(entry.target, size);
                schedule();
            }
        });
        const mutations = new MutationObserver(records => { if (hasMenuContentMutation(records)) schedule(); });
        mutations.observe(root, {
            subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ['data-word-fit-size'],
        });
        document.fonts?.addEventListener('loadingdone', schedule);
        refresh.current = schedule;
        schedule();
        return () => {
            refresh.current = undefined;
            resize.disconnect();
            mutations.disconnect();
            document.fonts?.removeEventListener('loadingdone', schedule);
            cancelAnimationFrame(frame);
        };
    }, [rootRef]);
    useLayoutEffect(() => refresh.current?.(), [textMetrics]);
}
