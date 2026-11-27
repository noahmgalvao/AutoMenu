import { mergePaginationMeasurements } from '../../../domain/menu/paginationMeasurements';
import { applyResponsivePrices } from './useResponsivePrices';
import { applyGroupedWordFit } from './textFit';
import { useCallback, useMemo, useState, useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getPaginationHeightKey, getPaginationChunkHeightKey, type PageLayout } from '../../../domain/menu/menuPagination';
import { getMenuTypographyScale, getMeasuredMenuTypographyScale } from '../../../domain/menu/menuPagination';
import type { MenuStyle, Product } from '../../../domain/menu/model';
import { livePhotoScaleVariable } from './photoSizing';

export function useMenuPageMeasurements(rootRef: RefObject<HTMLElement | null>, pages: PageLayout[], columnCount: number,
    setMeasuredHeights: Dispatch<SetStateAction<ReadonlyMap<string, number>>>, typographyScale: number, typicalFontSize: number, visiblePage?: number, onMeasure?: (heights: ReadonlyMap<string, number>) => void, source?: unknown) {
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const dimensions = new Map<string, string>();
        const imageKey = (image: HTMLImageElement) => `${image.naturalWidth}:${image.naturalHeight}`;
        root.querySelectorAll<HTMLImageElement>('img').forEach(image => {
            if (image.complete && image.naturalWidth) dimensions.set(image.currentSrc || image.src, imageKey(image));
        });
        const reset = () => setMeasuredHeights(new Map());
        const loaded = (event: Event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return;
            const url = image.currentSrc || image.src, size = imageKey(image);
            if (dimensions.get(url) === size) return;
            dimensions.set(url, size);
            reset();
        };
        root.addEventListener('load', loaded, true);
        document.fonts.addEventListener('loadingdone', reset);
        return () => { root.removeEventListener('load', loaded, true); document.fonts.removeEventListener('loadingdone', reset); };
    }, [rootRef, setMeasuredHeights, source]);
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const headers = Array.from(root.querySelectorAll<HTMLElement>('[data-heading-measurement]:not([data-heading-draft])'));
        const items = Array.from(root.querySelectorAll<HTMLElement>(
            '[data-pagination-chunk-content] > [data-pagination-item], [data-pagination-chunk-content] > [data-pagination-grid]'
        ));
        const chunks = Array.from(root.querySelectorAll<HTMLElement>('[data-category-chunk]'));
        let frame = 0;
        let previousSample: ReadonlyMap<string, number> | undefined;
        const measure = () => {
            if (root.style.getPropertyValue(livePhotoScaleVariable('product')) || root.style.getPropertyValue(livePhotoScaleVariable('category'))) return;
            applyGroupedWordFit(root, typographyScale, typicalFontSize);
            // Font fitting and price placement must describe the same frame. Measuring the
            // previous price layout after a font reset permanently over-shrinks this source.
            const minimum = Math.max(13, ...Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit-minimum]'), element => Number(element.dataset.wordFitMinimum) || 13));
            applyResponsivePrices(root, minimum);
            const next = new Map<string, number>();
            for (const header of headers) {
                if (header.offsetWidth && header.dataset.headingMeasurement) {
                    const css = getComputedStyle(header);
                    next.set(header.dataset.headingMeasurement, parseFloat(css.height));
                }
            }
            for (const item of items) {
                const column = item.closest<HTMLElement>('[data-drag-column-container="category"]');
                if (!column?.offsetWidth) continue;
                const width = parseFloat(getComputedStyle(column).width);
                const css = getComputedStyle(item);
                const bottomMargin = parseFloat(css.marginBottom) || 0;
                const itemKey = item.dataset.paginationItem;
                if (itemKey) {
                    next.set(getPaginationHeightKey(itemKey, width), parseFloat(css.height) + (parseFloat(css.marginTop) || 0) + bottomMargin);
                    continue;
                }

                // The grid renders consecutive pagination rows as one element.
                const tracks = css.gridTemplateRows.split(' ').map(parseFloat);
                const children = Array.from(item.children) as HTMLElement[];
                const columns = Number(item.dataset.paginationColumns) || columnCount;
                tracks.forEach((height, row) => {
                    const ids = children.slice(row * columns, (row + 1) * columns).map((child) => child.dataset.dragId);
                    if (!ids.length || !Number.isFinite(height)) return;
                    const key = getPaginationHeightKey(JSON.stringify(['product-row', ids]), width);
                    const gap = row === tracks.length - 1 ? bottomMargin : parseFloat(css.rowGap) || 0;
                    next.set(key, height + gap);
                });
            }
            for (const chunk of chunks) {
                const column = chunk.closest<HTMLElement>('[data-drag-column-container="category"]');
                if (!column?.offsetWidth || !chunk.dataset.categoryChunk) continue;
                next.set(getPaginationChunkHeightKey(chunk.dataset.categoryChunk, parseFloat(getComputedStyle(column).width)),
                    parseFloat(getComputedStyle(chunk).height));
            }
            // Reparented text can still be applying its word/price fit. Do not
            // retain a transient oversized frame as the safe bound for this edit.
            const settled = previousSample?.size === next.size && [...next].every(([key, height]) =>
                Math.abs(height - (previousSample!.get(key) ?? Infinity)) < .25);
            previousSample = next;
            if (!settled) { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); return; }
            onMeasure?.(next);
            setMeasuredHeights(current => mergePaginationMeasurements(current, next));
        };
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        headers.forEach(header => observer.observe(header));
        items.forEach((item) => observer.observe(item));
        chunks.forEach(chunk => observer.observe(chunk));
        const wordChanges = new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        wordChanges.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-word-fit-size', 'data-word-fit-base-size', 'data-price-width-scale', 'data-price-base-size'] });
        // Let the committed layout settle before feeding measurements back into
        // pagination. A photo-heavy category can need several fitting passes;
        // synchronous layout-effect updates would recursively exhaust React's
        // update limit before the browser gets a chance to paint.
        frame = requestAnimationFrame(measure);
        return () => {
            observer.disconnect();
            wordChanges.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [rootRef, pages, columnCount, typographyScale, typicalFontSize, visiblePage, setMeasuredHeights, onMeasure]);
}

/** Render corrections last only for this source document. Reverting an edit restores its original scale. */
export function useMenuTypographyFit(style: MenuStyle, products: Product[], groups: Record<string, Product[]>, order: string[]) {
    const estimatedScale = useMemo(() => getMenuTypographyScale(style, groups, order), [style, groups, order]);
    const [fit, setFit] = useState<{ style: MenuStyle; products: Product[]; scale: number }>();
    const typographyScale = fit?.style === style && fit.products === products ? Math.min(estimatedScale, fit.scale) : estimatedScale;
    const fitMeasuredContent = useCallback((heights: ReadonlyMap<string, number>) => {
        const scale = getMeasuredMenuTypographyScale(style, groups, order, typographyScale, heights);
        if (scale >= typographyScale) return;
        setFit(current => current?.style === style && current.products === products && current.scale <= scale
            ? current : { style, products, scale });
    }, [style, products, groups, order, typographyScale]);
    return { typographyScale, fitMeasuredContent };
}
