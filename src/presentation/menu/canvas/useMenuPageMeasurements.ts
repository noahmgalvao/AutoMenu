import { useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getPaginationHeightKey, type PageLayout } from '../../../domain/menu/menuPagination';
import { livePhotoScaleVariable } from './photoSizing';

export function useMenuPageMeasurements(rootRef: RefObject<HTMLElement | null>, pages: PageLayout[], columnCount: number,
    setMeasuredHeights: Dispatch<SetStateAction<ReadonlyMap<string, number>>>, visiblePage?: number) {
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const headers = Array.from(root.querySelectorAll<HTMLElement>('[data-heading-measurement]:not([data-heading-draft])'));
        const items = Array.from(root.querySelectorAll<HTMLElement>(
            '[data-pagination-chunk-content] > [data-pagination-item], [data-pagination-chunk-content] > [data-pagination-grid]'
        ));
        let frame = 0;
        const measure = () => {
            if (root.style.getPropertyValue(livePhotoScaleVariable('product')) || root.style.getPropertyValue(livePhotoScaleVariable('category'))) return;
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
                tracks.forEach((height, row) => {
                    const ids = children.slice(row * columnCount, (row + 1) * columnCount).map((child) => child.dataset.dragId);
                    if (!ids.length || !Number.isFinite(height)) return;
                    const key = getPaginationHeightKey(JSON.stringify(['product-row', ids]), width);
                    const gap = row === tracks.length - 1 ? bottomMargin : parseFloat(css.rowGap) || 0;
                    next.set(key, height + gap);
                });
            }
            setMeasuredHeights((current) => {
                const changes = [...next].filter(([key, height]) => Number.isFinite(height) && Math.abs((current.get(key) ?? -1) - height) >= 0.25);
                return changes.length ? new Map([...current, ...changes]) : current;
            });
        };
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        headers.forEach(header => observer.observe(header));
        items.forEach((item) => observer.observe(item));
        measure();
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [rootRef, pages, columnCount, visiblePage, setMeasuredHeights]);
}
