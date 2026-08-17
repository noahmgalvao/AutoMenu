import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuStyle } from '../../types';
import { A4_WIDTH_PX } from '../../utils/menuPagination';
import { normalizeColumnWidths } from '../../utils/categoryColumns';
import { resolveMenuMargins } from '../../utils/styleRules';
import { canApplyLiveColumnWidths, triggerLimitFeedback } from '../../utils/textFit';

type ResizeEdge = 'left' | 'right';

export interface ColumnResizeGuide {
    pageIndex: number;
    x: number;
    snappedToCenter: boolean;
}

interface ResizeSession {
    pageIndex: number;
    boundaryIndex: number;
    columnCount: number;
    grid: HTMLElement;
    page: HTMLElement;
    pointerId: number;
    initialWidths: number[];
    source: HTMLElement;
}

const MIN_COLUMN_WIDTH_PX = 96;
const CENTER_SNAP_DISTANCE_PX = 18;

export const useCategoryColumnResize = (
    style: MenuStyle,
    onStyleUpdate?: React.Dispatch<React.SetStateAction<MenuStyle>>,
) => {
    const [liveCategoryColumnWidths, setLiveCategoryColumnWidths] = useState<number[] | null>(null);
    const [columnResizeGuide, setColumnResizeGuide] = useState<ColumnResizeGuide | null>(null);
    const sessionRef = useRef<ResizeSession | null>(null);
    const liveWidthsRef = useRef<number[] | null>(null);

    const finishResize = useCallback((commit: boolean) => {
        const session = sessionRef.current;
        if (!session) return;

        if (commit && liveWidthsRef.current && onStyleUpdate) {
            const committedWidths = liveWidthsRef.current;
            onStyleUpdate((previous) => ({
                ...previous,
                categoryColumnWidths: committedWidths,
                name: 'Custom',
            }));
        }

        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        sessionRef.current = null;
        liveWidthsRef.current = null;
        setLiveCategoryColumnWidths(null);
        setColumnResizeGuide(null);
    }, [onStyleUpdate]);

    useEffect(() => () => finishResize(false), [finishResize]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const session = sessionRef.current;
            if (!session || event.pointerId !== session.pointerId) return;
            event.preventDefault();

            const gridRect = session.grid.getBoundingClientRect();
            const pageRect = session.page.getBoundingClientRect();
            const scale = Math.max(0.001, pageRect.width / A4_WIDTH_PX);
            const margins = resolveMenuMargins(style);
            const gap = Math.max(0, margins.columnGap * scale);
            const usableColumnsWidth = Math.max(1, gridRect.width - (gap * (session.columnCount - 1)));
            const initialPixelWidths = session.initialWidths.map((width) => width * usableColumnsWidth);
            const leftPairStart = initialPixelWidths
                .slice(0, session.boundaryIndex)
                .reduce((sum, width) => sum + width, 0)
                + (gap * session.boundaryIndex);
            const pairWidth = initialPixelWidths[session.boundaryIndex]
                + initialPixelWidths[session.boundaryIndex + 1];
            const pageCenterClientX = pageRect.left + (pageRect.width / 2);
            let boundaryClientX = event.clientX;
            const snapDistance = CENTER_SNAP_DISTANCE_PX * scale;
            const snappedToCenter = Math.abs(boundaryClientX - pageCenterClientX) <= snapDistance;
            if (snappedToCenter) boundaryClientX = pageCenterClientX;

            const minimumWidth = Math.min(MIN_COLUMN_WIDTH_PX * scale, pairWidth * 0.42);
            const minimumBoundary = gridRect.left + leftPairStart + minimumWidth;
            const maximumBoundary = gridRect.left + leftPairStart + pairWidth - minimumWidth;
            boundaryClientX = Math.max(minimumBoundary, Math.min(maximumBoundary, boundaryClientX));

            const nextLeftWidth = boundaryClientX - gridRect.left - leftPairStart;
            const nextRightWidth = pairWidth - nextLeftWidth;
            const nextWidths = [...initialPixelWidths];
            nextWidths[session.boundaryIndex] = nextLeftWidth;
            nextWidths[session.boundaryIndex + 1] = nextRightWidth;
            const normalized = normalizeColumnWidths(nextWidths, session.columnCount);
            if (!style.allowSameWordBreak && !canApplyLiveColumnWidths(session.grid, session.initialWidths, normalized)) {
                triggerLimitFeedback(session.source);
                return;
            }
            liveWidthsRef.current = normalized;
            setLiveCategoryColumnWidths(normalized);
            setColumnResizeGuide({
                pageIndex: session.pageIndex,
                x: (boundaryClientX - pageRect.left) / scale,
                snappedToCenter,
            });
        };
        const handlePointerUp = (event: PointerEvent) => {
            if (sessionRef.current?.pointerId !== event.pointerId) return;
            finishResize(true);
        };
        const handlePointerCancel = (event: PointerEvent) => {
            if (sessionRef.current?.pointerId !== event.pointerId) return;
            finishResize(false);
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
        };
    }, [finishResize, style]);

    const startCategoryColumnResize = useCallback((
        event: React.PointerEvent<HTMLElement>,
        edge: ResizeEdge,
    ) => {
        const source = event.currentTarget;
        const column = source.closest<HTMLElement>('[data-drag-column-container="category"]');
        const page = source.closest<HTMLElement>('[data-menu-print-page="true"]');
        const grid = column?.parentElement;
        if (!column || !page || !grid) return;

        const pageIndex = Number(page.dataset.pageIndex ?? 0);
        const columnIndex = Number(column.dataset.dragColumnIndex ?? 0);
        const columnCount = Number(style.categoryColumnCount || 1);
        const boundaryIndex = edge === 'right' ? columnIndex : columnIndex - 1;
        if (columnCount < 2 || boundaryIndex < 0 || boundaryIndex >= columnCount - 1) return;

        event.preventDefault();
        event.stopPropagation();
        source.setPointerCapture?.(event.pointerId);
        const lanes = Array.from(
            grid.querySelectorAll<HTMLElement>(':scope > [data-drag-column-container="category"]'),
        );
        const measuredWidths = lanes
            .sort((left, right) => Number(left.dataset.dragColumnIndex) - Number(right.dataset.dragColumnIndex))
            .map((lane) => lane.getBoundingClientRect().width);
        const initialWidths = normalizeColumnWidths(
            measuredWidths.length === columnCount
                ? measuredWidths
                : style.categoryColumnWidths,
            columnCount,
        );

        sessionRef.current = {
            pageIndex,
            boundaryIndex,
            columnCount,
            grid,
            page,
            pointerId: event.pointerId,
            initialWidths,
            source,
        };
        liveWidthsRef.current = initialWidths;
        setLiveCategoryColumnWidths(liveWidthsRef.current);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [style.categoryColumnCount, style.categoryColumnWidths]);

    return {
        liveCategoryColumnWidths,
        columnResizeGuide,
        startCategoryColumnResize,
    };
};
