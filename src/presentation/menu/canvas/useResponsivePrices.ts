import { hasMenuContentMutation } from './menuContentMutations';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { MenuStyle } from '../../../domain/menu/model';
import { resolveMinimumFontSize } from '../../../domain/menu/styleRules';
import { measurePriceWidth, measureRenderedText } from './textFit';

const px = (value: string) => parseFloat(value) || 0;
const setProperty = (element: HTMLElement, property: string, value: string) => {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
};

function measurePriceRow(row: HTMLElement, minimum: number) {
    const title = row.querySelector<HTMLElement>('[data-divider-title]');
    const price = row.querySelector<HTMLElement>('[data-template-price]');
    const value = price?.querySelector<HTMLElement>('[data-price-value]');
    if (!title || !price || !value || !row.clientWidth) return null;

    const priceCss = getComputedStyle(price);
    const titleCss = getComputedStyle(title);
    const base = Number(price.dataset.priceBaseSize);
    const measurePrice = (size: number) => measurePriceWidth(price, size, priceCss);
    let low = minimum;
    let high = base;
    if (measurePrice(base) > row.clientWidth + .5) {
        for (let step = 0; step < 10 && high - low > .05; step++) {
            const middle = (low + high) / 2;
            if (measurePrice(middle) <= row.clientWidth + .5) low = middle;
            else high = middle;
        }
    } else low = base;

    const titleGroup = title.parentElement;
    const marker = titleGroup?.querySelector<HTMLElement>('[data-menu-marker]');
    const markerWidth = marker && titleGroup ? marker.offsetWidth + px(getComputedStyle(titleGroup).columnGap) : 0;
    const nameWidth = Math.ceil(measureRenderedText(title.textContent || '', px(titleCss.fontSize), titleCss) + markerWidth) + 1;
    const rowGap = px(getComputedStyle(row).columnGap);
    const dividerGap = row.hasAttribute('data-product-leader') ? rowGap : 0;
    const inlineWidth = row.clientWidth - nameWidth - rowGap - dividerGap;
    const priceWidth = measurePrice(px(priceCss.fontSize));
    const nameAlignment = titleCss.textAlign;
    const gap = Math.max(4, rowGap);
    const rowCss = getComputedStyle(row);
    const spacingShare = Math.min(1, Math.max(0, px(rowCss.getPropertyValue('--product-price-control'))
        / Math.max(1, px(rowCss.getPropertyValue('--product-price-reference')))));
    return { row, price, titleGroup, nameWidth, priceWidth, nameAlignment, gap, spacingShare,
        widthScale: String(low / base), wrapped: priceWidth > inlineWidth + (row.hasAttribute('data-price-wrap') ? -1 : .5) };
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

export function applyResponsivePrices(root: HTMLElement, minimum: number) {
    const metrics = Array.from(root.querySelectorAll<HTMLElement>('[data-product-text-row]'), row => {
        const metric = measurePriceRow(row, minimum);
        if (!metric && !row.querySelector('[data-template-price]')) row.removeAttribute('data-price-wrap');
        return metric;
    }).filter(metric => metric !== null);

    for (const { row, price, widthScale, wrapped } of metrics) {
        if (price.dataset.priceWidthScale !== widthScale) price.dataset.priceWidthScale = widthScale;
        row.toggleAttribute('data-price-wrap', wrapped);
    }
    for (const { row, price, titleGroup, nameWidth, priceWidth, nameAlignment, gap, spacingShare, wrapped } of metrics) {
        const slot = price.closest<HTMLElement>('[data-product-price-slot]');
        if (!slot || !titleGroup) continue;
        const alignment = nameAlignment === 'right' ? 'right' : slot.dataset.priceAlignment || 'right';
        const spare = Math.max(0, row.clientWidth - nameWidth - priceWidth - gap);
        const leading = nameAlignment === 'right' ? spare : nameAlignment === 'center' ? spare / 2 : 0;
        const maximumGap = Math.max(gap, row.clientWidth - leading - nameWidth - priceWidth);
        const far = gap + (maximumGap - gap) * spacingShare;
        const distance = alignment === 'left' ? gap : alignment === 'center' ? (gap + far) / 2 : far;
        setProperty(titleGroup, '--automenu-title-width', `${Math.min(nameWidth, row.clientWidth)}px`);
        setProperty(titleGroup, '--automenu-title-leading', `${wrapped ? 0 : leading}px`);
        setProperty(slot, '--automenu-price-offset', `${Math.max(0, distance - gap)}px`);
        const { left, right } = wrapped ? measureWrappedPriceSpace(row, slot) : { left: 0, right: 0 };
        const wrappedAlignment = nameAlignment === 'center' && alignment === 'left' ? 'center' : alignment;
        setProperty(slot, 'justify-content', wrapped ? wrappedAlignment === 'left' ? 'flex-start'
            : wrappedAlignment === 'center' ? 'center' : 'flex-end' : 'flex-start');
        const wrappedWidth = row.clientWidth + left + right;
        const inset = nameAlignment === 'center' && alignment === 'center'
            ? Math.max(0, (wrappedWidth - priceWidth) / 2)
            : alignment === 'left' && nameAlignment !== 'center' ? Math.min(gap, Math.max(0, wrappedWidth - priceWidth)) : 0;
        setProperty(slot, 'padding-inline-start', wrapped ? `${inset}px` : '');
        setProperty(slot, '--automenu-price-left', `${left}px`);
        setProperty(slot, '--automenu-price-right', `${right}px`);
    }
}

export function useResponsivePrices(rootRef: RefObject<HTMLElement | null>, style: MenuStyle) {
    const refresh = useRef<() => void>(undefined);
    const minimum = resolveMinimumFontSize(style);
    const [name, price] = [style.elementStyles.productName, style.elementStyles.productPrice];
    const textMetrics = JSON.stringify([
        style.fontFamily, style.minimumFontSize, style.fontSizeLimits, style.contentSpacing?.productNameToPrice,
        style.design?.price, style.productPhotoAlignments, price?.textAlign,
        name?.textAlign, name?.fontFamily, name?.fontWeight, name?.italic, name?.fontSize, name?.textTransform, name?.letterSpacing,
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
            for (const row of rows) if (!observed.has(row)) { resize.observe(row); observed.add(row); }
            applyResponsivePrices(root, minimum);
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
            attributes: true, attributeFilter: ['data-word-fit-size', 'data-price-base-size', 'data-fitted-font-size'],
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
    }, [rootRef, minimum]);
    useLayoutEffect(() => refresh.current?.(), [textMetrics, style.itemFormattingOverrides]);
}
