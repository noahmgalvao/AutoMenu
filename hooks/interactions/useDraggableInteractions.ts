import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { CategoryPosition, Product } from '../../types';
import { InteractionProps } from './types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, FREE_TEXT_PREFIX, SAFETY_BUFFER, STANDARD_GAP, type CategoryPlacementAssignment } from '../../utils/menuPagination';
import {
    getCollisionSafeFreeTextTop,
    getNearestRenderedFreeTextTarget,
    getVerticalGapBetweenRects,
    moveFreeTextToGhostSlot,
    placeFreeTextInCategory,
    swapFreeTextItems,
    type FreeTextCategoryPlacement,
} from './freeTextMovement';
import { resolveMenuMargins } from '../../utils/styleRules';

type DragType = 'category' | 'product';
type DragItem = { type: DragType; id: string; group?: string } | null;
type FreeTextDragErrorPhase =
    | 'activate-drag'
    | 'pointer-reorder'
    | 'native-drag-start'
    | 'native-drag-over'
    | 'window-error'
    | 'unhandled-rejection';
type DragDiagnosticWindow = Window & {
    __automenuLastFreeTextDragError?: Record<string, unknown>;
};

interface PendingDrag {
    type: DragType;
    id: string;
    group?: string;
    element: HTMLElement;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    activationTimeoutId: number | null;
}

interface CategoryLane {
    element: HTMLElement;
    key: string;
    pageIndex: number;
    columnIndex: number;
    rect: DOMRect;
}

interface CategoryPage {
    pageIndex: number;
    rect: DOMRect;
}

interface CategoryTarget {
    element: HTMLElement;
    id: string;
    flowIndex: number;
    laneKey: string;
    rect: DOMRect;
}

interface ProductTarget {
    element: HTMLElement;
    id: string;
    orderIndex: number;
    laneKey: string;
    rect: DOMRect;
}

interface FreeTextPointerTarget {
    category: string;
    placement: FreeTextCategoryPlacement;
    targetProductId?: string;
    targetRect?: DOMRect;
}

interface FreeTextDragSlot {
    category: string;
    marginTop: number;
}

interface FreeTextSwapRebase {
    sourceId: string;
    sourceCategory: string;
    pointer: { x: number; y: number };
}

interface CategorySwapLock {
    sourceId: string;
    targetId: string;
    position: 'before' | 'after';
    freeCollision?: {
        laneKey: string;
        bounds: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
}

interface CategorySwapRebase {
    sourceId: string;
    pointer: { x: number; y: number };
}

interface ScrollContainerSnapshot {
    element: HTMLElement;
    scrollTop: number;
    scrollLeft: number;
    overflow: string;
    overflowX: string;
    overflowY: string;
    touchAction: string;
    overscrollBehavior: string;
}

const POINTER_MOVE_THRESHOLD_PX = 8;
const TOUCH_MOVE_CANCEL_THRESHOLD_PX = 10;
const TOUCH_LONG_PRESS_MS = 320;
const CATEGORY_COLUMN_SWITCH_INSET_PX = 32;
const CATEGORY_PAGE_SWITCH_INSET_PX = 72;
const CATEGORY_PAGE_SWITCH_THRESHOLD_PX = 96;
const PRODUCT_DESIGNER_CATEGORY_REORDER_MIN_DISTANCE_PX = 56;
const TOUCH_CANCEL_COMMIT_DELAY_MS = 900;
const DRAG_EVENT_OPTIONS: AddEventListenerOptions = { passive: false, capture: true };

const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
        target.closest(
            'button, input, textarea, select, option, label, a, [contenteditable="true"], [data-drag-ignore="true"]'
        )
    );
};

const areOrdersEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const getSafeFreeTextMargin = (value: unknown) => {
    const margin = Number(value);
    return Number.isFinite(margin)
        ? Math.max(0, Math.min(A4_HEIGHT_PX, Math.round(margin)))
        : 0;
};

const escapeSelectorValue = (value: string) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

const getCategoryLaneKey = (pageIndex?: string, columnIndex?: string) =>
    `${Number(pageIndex ?? 0)}:${Number(columnIndex ?? 0)}`;

const moveItemToInsertionIndex = (order: string[], itemId: string, insertionIndex: number) => {
    const nextOrder = order.filter((id) => id !== itemId);
    const boundedIndex = Math.max(0, Math.min(insertionIndex, nextOrder.length));
    nextOrder.splice(boundedIndex, 0, itemId);
    return nextOrder;
};

const getNativeDragPointer = (event: React.DragEvent<HTMLElement>) => {
    if (event.clientX !== 0 || event.clientY !== 0) {
        return { x: event.clientX, y: event.clientY };
    }

    const rect = event.currentTarget.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
};

const normalizeDragError = (error: unknown) => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        name: typeof error,
        message: String(error),
        stack: undefined,
    };
};

export const useDraggableInteractions = (
    props: InteractionProps,
    groupedProductsBase: Record<string, Product[]>,
    sortedCategoriesBase: string[],
    handleSelection: (type: 'product' | 'category' | 'freeText' | 'addedImage' | null, id: string | null) => void,
    editingId: string | null,
    multiSelectMode: boolean = false
) => {
    const { products, style, onCommitCategoryOrder, onCommitProductOrder, onStyleUpdate, onUpdateProduct, onUpdateProducts } = props;

    const dragScope = useRef(`drag-scope-${Math.random().toString(36).slice(2)}`).current;

    const sortedCategoriesRef = useRef(sortedCategoriesBase);
    const groupedProductsRef = useRef(groupedProductsBase);

    useEffect(() => {
        sortedCategoriesRef.current = sortedCategoriesBase;
    }, [sortedCategoriesBase]);

    useEffect(() => {
        groupedProductsRef.current = groupedProductsBase;
    }, [groupedProductsBase]);

    const [draggedItem, setDraggedItem] = useState<DragItem>(null);
    const [liveCategoryOrder, setLiveCategoryOrder] = useState<string[] | null>(null);
    const [liveCategoryPageAssignments, setLiveCategoryPageAssignments] = useState<Record<string, CategoryPlacementAssignment> | null>(null);
    const [liveCategoryPositions, setLiveCategoryPositions] = useState<Record<string, CategoryPosition> | null>(null);
    const [liveProductOrder, setLiveProductOrder] = useState<Record<string, string[]> | null>(null);

    const draggedItemRef = useRef<DragItem>(null);
    const activePointerRef = useRef<{ pointerId: number; pointerType: string } | null>(null);
    const pointerCaptureRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
    const pendingDragRef = useRef<PendingDrag | null>(null);
    const liveCategoryOrderRef = useRef<string[] | null>(null);
    const liveCategoryPageAssignmentsRef = useRef<Record<string, CategoryPlacementAssignment> | null>(null);
    const liveCategoryPositionsRef = useRef<Record<string, CategoryPosition> | null>(null);
    const liveProductOrderRef = useRef<Record<string, string[]> | null>(null);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
    const dragSourceContextRef = useRef<string | null>(null);
    const productInsertionIndexRef = useRef<number | null>(null);
    const touchCancelCommitTimeoutRef = useRef<number | null>(null);
    const freeTextPointerOffsetYRef = useRef<number | null>(null);
    const freeTextActiveCategoryRef = useRef<Record<string, string>>({});
    const freeTextDragSlotRef = useRef<FreeTextDragSlot | null>(null);
    const freeTextSwapLockRef = useRef<{
        sourceId: string;
        targetId: string;
    } | null>(null);
    const freeTextSwapRebaseRef = useRef<FreeTextSwapRebase | null>(null);
    const freeTextSwapRebaseFrameRef = useRef<number | null>(null);
    const lastNativeTouchMoveAtRef = useRef(0);
    const categoryActivePageIndexRef = useRef<number | null>(null);
    const categoryActiveLaneKeyRef = useRef<string | null>(null);
    const categoryPageSwitchOriginXRef = useRef<number | null>(null);
    const categoryPointerOffsetYRef = useRef<number | null>(null);
    const categoryDraggedHeightRef = useRef<number | null>(null);
    const categorySwapLockRef = useRef<CategorySwapLock | null>(null);
    const categorySwapRebaseRef = useRef<CategorySwapRebase | null>(null);
    const categorySwapRebaseFrameRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const hasDragMutationRef = useRef(false);
    const listenersAttachedRef = useRef(false);
    const nativeTouchBlockerAttachedRef = useRef(false);
    const removeGlobalListenersRef = useRef<() => void>(() => { });
    const removeNativeTouchBlockerRef = useRef<() => void>(() => { });
    const performCommitAndCleanupRef = useRef<() => void>(() => { });
    const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => { });
    const pointerUpHandlerRef = useRef<(event: PointerEvent) => void>(() => { });
    const pointerCancelHandlerRef = useRef<(event: PointerEvent) => void>(() => { });
    const touchMoveHandlerRef = useRef<(event: TouchEvent) => void>(() => { });
    const touchEndHandlerRef = useRef<(event: TouchEvent) => void>(() => { });
    const touchCancelHandlerRef = useRef<(event: TouchEvent) => void>(() => { });
    const blurHandlerRef = useRef<() => void>(() => { });
    const bodyStyleRef = useRef<{
        userSelect: string;
        webkitUserSelect: string;
        cursor: string;
        touchAction: string;
        overflow: string;
        overscrollBehavior: string;
        htmlOverflow: string;
        htmlOverscrollBehavior: string;
        htmlTouchAction: string;
        scrollX: number;
        scrollY: number;
    } | null>(null);
    const scrollContainerStyleRef = useRef<ScrollContainerSnapshot[]>([]);

    const getDiagnosticProduct = useCallback((productId?: string) => {
        if (!productId) return null;

        const directProduct = products.find((product) => product.id === productId);
        if (directProduct) return directProduct;

        for (const groupProducts of Object.values(groupedProductsRef.current)) {
            const groupedProduct = groupProducts.find((product) => product.id === productId);
            if (groupedProduct) return groupedProduct;
        }

        return null;
    }, [products]);

    const reportFreeTextDragError = useCallback((
        phase: FreeTextDragErrorPhase,
        error: unknown,
        extra: Record<string, unknown> = {}
    ) => {
        if (typeof window === 'undefined') return;

        const activeItem = draggedItemRef.current;
        const pendingItem = pendingDragRef.current;
        const explicitProductId = typeof extra.productId === 'string' ? extra.productId : undefined;
        const productId = explicitProductId || (activeItem?.type === 'product'
            ? activeItem.id
            : pendingItem?.type === 'product'
                ? pendingItem.id
                : undefined);
        const product = getDiagnosticProduct(productId);

        if (!product?.isFreeText) return;

        const payload = {
            phase,
            error: normalizeDragError(error),
            product: {
                id: product.id,
                category: product.category,
                customMarginTop: product.customMarginTop,
                isFreeText: product.isFreeText,
            },
            draggedItem: activeItem,
            pendingDrag: pendingItem ? {
                type: pendingItem.type,
                id: pendingItem.id,
                group: pendingItem.group,
                pointerId: pendingItem.pointerId,
                pointerType: pendingItem.pointerType,
                startX: pendingItem.startX,
                startY: pendingItem.startY,
            } : null,
            activePointer: activePointerRef.current,
            liveCategoryOrder: liveCategoryOrderRef.current,
            liveProductOrderCategories: liveProductOrderRef.current ? Object.keys(liveProductOrderRef.current) : null,
            activeFreeTextCategory: productId ? freeTextActiveCategoryRef.current[productId] : undefined,
            extra,
        };

        (window as DragDiagnosticWindow).__automenuLastFreeTextDragError = payload;
        window.dispatchEvent(new CustomEvent('automenu-free-text-drag-error', { detail: payload }));
        console.error('[AutoMenu][FreeTextDragCrash]', payload);
    }, [getDiagnosticProduct]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleWindowError = (event: ErrorEvent) => {
            reportFreeTextDragError('window-error', event.error || event.message, {
                message: event.message,
                source: event.filename,
                line: event.lineno,
                column: event.colno,
            });
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            reportFreeTextDragError('unhandled-rejection', event.reason, {});
        };

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [reportFreeTextDragError]);

    const clearPendingActivation = useCallback(() => {
        const pendingDrag = pendingDragRef.current;
        if (pendingDrag && pendingDrag.activationTimeoutId !== null) {
            window.clearTimeout(pendingDrag.activationTimeoutId);
        }
        pendingDragRef.current = null;
    }, []);

    const clearTouchCancelCommit = useCallback(() => {
        if (touchCancelCommitTimeoutRef.current !== null) {
            window.clearTimeout(touchCancelCommitTimeoutRef.current);
            touchCancelCommitTimeoutRef.current = null;
        }
    }, []);

    const scheduleTouchCancelCommit = useCallback(() => {
        clearTouchCancelCommit();
        touchCancelCommitTimeoutRef.current = window.setTimeout(() => {
            touchCancelCommitTimeoutRef.current = null;
            if (isDraggingRef.current && draggedItemRef.current) {
                performCommitAndCleanupRef.current();
            }
        }, TOUCH_CANCEL_COMMIT_DELAY_MS);
    }, [clearTouchCancelCommit]);

    const restoreBodyDragStyles = useCallback(() => {
        if (!bodyStyleRef.current || typeof document === 'undefined') return;
        const root = document.documentElement;

        document.body.style.userSelect = bodyStyleRef.current.userSelect;
        document.body.style.webkitUserSelect = bodyStyleRef.current.webkitUserSelect;
        document.body.style.cursor = bodyStyleRef.current.cursor;
        document.body.style.touchAction = bodyStyleRef.current.touchAction;
        document.body.style.overscrollBehavior = bodyStyleRef.current.overscrollBehavior;
        root.style.overscrollBehavior = bodyStyleRef.current.htmlOverscrollBehavior;
        root.style.touchAction = bodyStyleRef.current.htmlTouchAction;
        window.scrollTo(bodyStyleRef.current.scrollX, bodyStyleRef.current.scrollY);
        bodyStyleRef.current = null;
    }, []);

    const applyBodyDragStyles = useCallback(() => {
        if (typeof document === 'undefined' || bodyStyleRef.current) return;
        const root = document.documentElement;

        bodyStyleRef.current = {
            userSelect: document.body.style.userSelect,
            webkitUserSelect: document.body.style.webkitUserSelect,
            cursor: document.body.style.cursor,
            touchAction: document.body.style.touchAction,
            overflow: document.body.style.overflow,
            overscrollBehavior: document.body.style.overscrollBehavior,
            htmlOverflow: root.style.overflow,
            htmlOverscrollBehavior: root.style.overscrollBehavior,
            htmlTouchAction: root.style.touchAction,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
        };
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.cursor = 'grabbing';
        document.body.style.touchAction = 'none';
        document.body.style.overscrollBehavior = 'none';
        root.style.overscrollBehavior = 'none';
        root.style.touchAction = 'none';
    }, []);

    const lockScrollableAncestors = useCallback((sourceElement: HTMLElement) => {
        if (typeof window === 'undefined' || scrollContainerStyleRef.current.length > 0) return;

        const containers: HTMLElement[] = [];
        let current = sourceElement.parentElement;

        while (current && current !== document.body && current !== document.documentElement) {
            const computed = window.getComputedStyle(current);
            const canScroll = (
                /(auto|scroll|overlay)/.test(`${computed.overflowX} ${computed.overflowY}`) ||
                current.scrollHeight > current.clientHeight ||
                current.scrollWidth > current.clientWidth
            );

            if (canScroll) containers.push(current);
            current = current.parentElement;
        }

        scrollContainerStyleRef.current = containers.map((element) => ({
            element,
            scrollTop: element.scrollTop,
            scrollLeft: element.scrollLeft,
            overflow: element.style.overflow,
            overflowX: element.style.overflowX,
            overflowY: element.style.overflowY,
            touchAction: element.style.touchAction,
            overscrollBehavior: element.style.overscrollBehavior,
        }));

        scrollContainerStyleRef.current.forEach(({ element }) => {
            element.style.touchAction = 'none';
            element.style.overscrollBehavior = 'none';
        });
    }, []);

    const keepScrollLocked = useCallback(() => {
        if (typeof window !== 'undefined' && bodyStyleRef.current) {
            window.scrollTo(bodyStyleRef.current.scrollX, bodyStyleRef.current.scrollY);
        }

        scrollContainerStyleRef.current.forEach(({ element, scrollTop, scrollLeft }) => {
            if (element.scrollTop !== scrollTop) element.scrollTop = scrollTop;
            if (element.scrollLeft !== scrollLeft) element.scrollLeft = scrollLeft;
        });
    }, []);

    const restoreScrollableAncestors = useCallback(() => {
        scrollContainerStyleRef.current.forEach((snapshot) => {
            snapshot.element.style.touchAction = snapshot.touchAction;
            snapshot.element.style.overscrollBehavior = snapshot.overscrollBehavior;
            snapshot.element.scrollTop = snapshot.scrollTop;
            snapshot.element.scrollLeft = snapshot.scrollLeft;
        });
        scrollContainerStyleRef.current = [];
    }, []);

    const stableTouchMoveBlocker = useCallback((event: TouchEvent) => {
        touchMoveHandlerRef.current(event);
    }, []);

    const stableTouchEndBlocker = useCallback((event: TouchEvent) => {
        touchEndHandlerRef.current(event);
    }, []);

    const stableTouchCancelBlocker = useCallback((event: TouchEvent) => {
        touchCancelHandlerRef.current(event);
    }, []);

    const removeNativeTouchBlocker = useCallback(() => {
        if (!nativeTouchBlockerAttachedRef.current || typeof window === 'undefined') return;
        window.removeEventListener('touchmove', stableTouchMoveBlocker, true);
        window.removeEventListener('touchend', stableTouchEndBlocker, true);
        window.removeEventListener('touchcancel', stableTouchCancelBlocker, true);
        document.removeEventListener('touchmove', stableTouchMoveBlocker, true);
        document.removeEventListener('touchend', stableTouchEndBlocker, true);
        document.removeEventListener('touchcancel', stableTouchCancelBlocker, true);
        nativeTouchBlockerAttachedRef.current = false;
    }, [stableTouchCancelBlocker, stableTouchEndBlocker, stableTouchMoveBlocker]);

    useEffect(() => {
        removeNativeTouchBlockerRef.current = removeNativeTouchBlocker;
    }, [removeNativeTouchBlocker]);

    const attachNativeTouchBlocker = useCallback(() => {
        if (nativeTouchBlockerAttachedRef.current || typeof window === 'undefined') return;
        window.addEventListener('touchmove', stableTouchMoveBlocker, DRAG_EVENT_OPTIONS);
        window.addEventListener('touchend', stableTouchEndBlocker, DRAG_EVENT_OPTIONS);
        window.addEventListener('touchcancel', stableTouchCancelBlocker, DRAG_EVENT_OPTIONS);
        document.addEventListener('touchmove', stableTouchMoveBlocker, DRAG_EVENT_OPTIONS);
        document.addEventListener('touchend', stableTouchEndBlocker, DRAG_EVENT_OPTIONS);
        document.addEventListener('touchcancel', stableTouchCancelBlocker, DRAG_EVENT_OPTIONS);
        nativeTouchBlockerAttachedRef.current = true;
    }, [stableTouchCancelBlocker, stableTouchEndBlocker, stableTouchMoveBlocker]);

    const releasePointerCapture = useCallback(() => {
        const capture = pointerCaptureRef.current;
        if (!capture) return;

        try {
            if (capture.element.hasPointerCapture(capture.pointerId)) {
                capture.element.releasePointerCapture(capture.pointerId);
            }
        } catch {
            // The source element may have unmounted before cleanup.
        }

        pointerCaptureRef.current = null;
    }, []);

    const clearInvalidDragTargets = useCallback(() => {
        if (typeof document === 'undefined') return;
        document.querySelectorAll<HTMLElement>('.invalid-drag-target').forEach((element) => {
            element.classList.remove('invalid-drag-target');
        });
    }, []);

    const resetDragState = useCallback(() => {
        releasePointerCapture();

        setDraggedItem(null);
        setLiveCategoryOrder(null);
        setLiveCategoryPageAssignments(null);
        setLiveCategoryPositions(null);
        setLiveProductOrder(null);

        draggedItemRef.current = null;
        activePointerRef.current = null;
        liveCategoryOrderRef.current = null;
        liveCategoryPageAssignmentsRef.current = null;
        liveCategoryPositionsRef.current = null;
        liveProductOrderRef.current = null;
        lastPointerRef.current = null;
        dragStartPointerRef.current = null;
        dragSourceContextRef.current = null;
        productInsertionIndexRef.current = null;
        clearTouchCancelCommit();
        freeTextPointerOffsetYRef.current = null;
        freeTextActiveCategoryRef.current = {};
        freeTextDragSlotRef.current = null;
        freeTextSwapLockRef.current = null;
        if (freeTextSwapRebaseFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(freeTextSwapRebaseFrameRef.current);
        }
        freeTextSwapRebaseFrameRef.current = null;
        freeTextSwapRebaseRef.current = null;
        lastNativeTouchMoveAtRef.current = 0;
        categoryActivePageIndexRef.current = null;
        categoryActiveLaneKeyRef.current = null;
        categoryPageSwitchOriginXRef.current = null;
        categoryPointerOffsetYRef.current = null;
        categoryDraggedHeightRef.current = null;
        categorySwapLockRef.current = null;
        if (categorySwapRebaseFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(categorySwapRebaseFrameRef.current);
        }
        categorySwapRebaseFrameRef.current = null;
        categorySwapRebaseRef.current = null;
        isDraggingRef.current = false;
        hasDragMutationRef.current = false;
    }, [clearTouchCancelCommit, releasePointerCapture]);

    const cancelAndCleanup = useCallback(() => {
        clearPendingActivation();
        removeGlobalListenersRef.current();
        removeNativeTouchBlocker();
        clearInvalidDragTargets();
        restoreScrollableAncestors();
        restoreBodyDragStyles();
        resetDragState();
    }, [clearInvalidDragTargets, clearPendingActivation, removeNativeTouchBlocker, resetDragState, restoreBodyDragStyles, restoreScrollableAncestors]);

    const performCommitAndCleanup = useCallback(() => {
        const shouldCommit = isDraggingRef.current && hasDragMutationRef.current;
        const currentDraggedItem = draggedItemRef.current;
        const categoryOrderSnapshot = liveCategoryOrderRef.current;
        const categoryAssignmentsSnapshot = liveCategoryPageAssignmentsRef.current;
        const categoryPositionsSnapshot = liveCategoryPositionsRef.current;

        if (shouldCommit) {
            if (categoryOrderSnapshot && onCommitCategoryOrder) {
                onCommitCategoryOrder(categoryOrderSnapshot);
            }

            if (
                currentDraggedItem?.type === 'category' &&
                categoryOrderSnapshot &&
                categoryAssignmentsSnapshot &&
                onStyleUpdate
            ) {
                const nextPageBreaks = categoryOrderSnapshot.reduce<string[]>((breaks, category, index, order) => {
                    if (index === 0) return breaks;

                    const previousCategory = order[index - 1];
                    const previousPage = categoryAssignmentsSnapshot[previousCategory]?.pageIndex ?? 0;
                    const currentPage = categoryAssignmentsSnapshot[category]?.pageIndex ?? previousPage;

                    if (currentPage > previousPage) {
                        breaks.push(category);
                    }

                    return breaks;
                }, []);

                onStyleUpdate((prev) => ({
                    ...prev,
                    pageBreaks: nextPageBreaks,
                    categoryPlacements: {
                        ...(prev.categoryPlacements || {}),
                        ...categoryAssignmentsSnapshot,
                    },
                    categoryPositions: { ...(categoryPositionsSnapshot || prev.categoryPositions || {}) },
                    name: 'Custom',
                }));
            }

            const draggedProduct = currentDraggedItem?.type === 'product'
                ? products.find((product) => product.id === currentDraggedItem.id)
                : null;
            const activeFreeTextCategory = draggedProduct?.isFreeText
                ? (freeTextActiveCategoryRef.current[draggedProduct.id] || draggedProduct.category)
                : '';
            if (
                draggedProduct?.isFreeText &&
                activeFreeTextCategory.startsWith(FREE_TEXT_PREFIX) &&
                liveCategoryPageAssignmentsRef.current &&
                onStyleUpdate
            ) {
                const assignments = liveCategoryPageAssignmentsRef.current;
                onStyleUpdate((previous) => {
                    const columnCount = previous.categoryColumnCount || 1;
                    const categoryPlacements = Object.entries(assignments).reduce<Record<string, CategoryPlacementAssignment>>(
                        (result, [category, placement]) => {
                            const pageIndex = Number(placement.pageIndex);
                            const columnIndex = Number(placement.columnIndex);
                            result[category] = {
                                pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
                                columnIndex: Number.isFinite(columnIndex)
                                    ? Math.max(0, Math.min(columnCount - 1, Math.floor(columnIndex)))
                                    : 0,
                            };
                            return result;
                        },
                        {}
                    );
                    return { ...previous, categoryPlacements, name: 'Custom' };
                });
            }

            if (liveProductOrderRef.current && onCommitProductOrder) {
                Object.entries(liveProductOrderRef.current).forEach(([category, order]) => {
                    onCommitProductOrder(category, order);
                });
            }
        }

        clearPendingActivation();
        removeGlobalListenersRef.current();
        removeNativeTouchBlocker();
        clearInvalidDragTargets();
        restoreScrollableAncestors();
        restoreBodyDragStyles();
        resetDragState();
    }, [
        clearInvalidDragTargets,
        clearPendingActivation,
        removeNativeTouchBlocker,
        onCommitCategoryOrder,
        onCommitProductOrder,
        onStyleUpdate,
        products,
        resetDragState,
        restoreBodyDragStyles,
        restoreScrollableAncestors,
    ]);

    useEffect(() => {
        performCommitAndCleanupRef.current = performCommitAndCleanup;
    }, [performCommitAndCleanup]);

    const initializeLiveCategoryOrder = useCallback((order: string[]) => {
        setLiveCategoryOrder(order);
        liveCategoryOrderRef.current = order;
    }, []);

    const initializeLiveCategoryPageAssignments = useCallback((assignments: Record<string, CategoryPlacementAssignment>) => {
        setLiveCategoryPageAssignments(assignments);
        liveCategoryPageAssignmentsRef.current = assignments;
    }, []);

    const initializeLiveProductOrder = useCallback((orderMap: Record<string, string[]>) => {
        setLiveProductOrder(orderMap);
        liveProductOrderRef.current = orderMap;
    }, []);

    const getRenderedDragElement = useCallback(
        (type: DragType, id: string, group?: string) => {
            if (typeof document === 'undefined') return null;
            const scope = escapeSelectorValue(dragScope);
            const elementId = escapeSelectorValue(id);
            const groupSelector = group ? `[data-drag-group="${escapeSelectorValue(group)}"]` : '';
            return document.querySelector<HTMLElement>(
                `[data-drag-scope="${scope}"][data-drag-type="${type}"][data-drag-id="${elementId}"]${groupSelector}`
            );
        },
        [dragScope]
    );

    const getLatestProductById = useCallback(
        (productId: string) => {
            for (const groupProducts of Object.values(groupedProductsRef.current)) {
                const product = groupProducts.find((candidate) => candidate.id === productId);
                if (product) return product;
            }
            return products.find((candidate) => candidate.id === productId) || null;
        },
        [products]
    );

    const rebaseFreeTextAfterSwap = useCallback((rebase: FreeTextSwapRebase) => {
        if (typeof window === 'undefined') return;

        if (freeTextSwapRebaseFrameRef.current !== null) {
            window.cancelAnimationFrame(freeTextSwapRebaseFrameRef.current);
        }

        const applyRebase = (current: FreeTextSwapRebase, allowAnyGroup: boolean) => {
            const sourceElement =
                getRenderedDragElement('product', current.sourceId, current.sourceCategory) ||
                (allowAnyGroup ? getRenderedDragElement('product', current.sourceId) : null);
            const sourceRect = sourceElement?.getBoundingClientRect();
            if (!sourceRect) return false;

            const sourceProduct = getLatestProductById(current.sourceId);
            const rawMargin = Number(sourceProduct?.customMarginTop);
            freeTextPointerOffsetYRef.current = current.pointer.y - sourceRect.top;
            freeTextActiveCategoryRef.current[current.sourceId] = current.sourceCategory;
            freeTextDragSlotRef.current = {
                category: current.sourceCategory,
                marginTop: Number.isFinite(rawMargin) ? rawMargin : 0,
            };
            lastPointerRef.current = current.pointer;
            return true;
        };

        if (applyRebase(rebase, false)) {
            freeTextSwapRebaseRef.current = null;
            freeTextSwapRebaseFrameRef.current = null;
            return;
        }

        freeTextSwapRebaseRef.current = rebase;
        freeTextSwapRebaseFrameRef.current = window.requestAnimationFrame(() => {
            freeTextSwapRebaseFrameRef.current = null;
            const current = freeTextSwapRebaseRef.current;
            if (!current || !isDraggingRef.current || draggedItemRef.current?.id !== current.sourceId) {
                freeTextSwapRebaseRef.current = null;
                return;
            }

            applyRebase(current, true);
            freeTextSwapRebaseRef.current = null;
        });
    }, [getLatestProductById, getRenderedDragElement]);

    const createProductOrderSnapshot = useCallback(() => {
        const initialOrder: Record<string, string[]> = {};
        Object.keys(groupedProductsRef.current).forEach((category) => {
            initialOrder[category] = groupedProductsRef.current[category].map((product) => product.id);
        });
        return initialOrder;
    }, []);

    const initializeProductDragState = useCallback(
        (productId: string, group?: string, pointer?: { x: number; y: number }) => {
            const initialOrder = createProductOrderSnapshot();
            productInsertionIndexRef.current = group
                ? initialOrder[group]?.indexOf(productId) ?? null
                : null;
            initializeLiveProductOrder(initialOrder);

            const currentElement = getRenderedDragElement('product', productId, group)
                || getRenderedDragElement('product', productId);
            const currentLane = currentElement?.closest<HTMLElement>(
                '[data-drag-column-container="category"][data-drag-page-index][data-drag-column-index]'
            );
            categoryActivePageIndexRef.current = currentLane
                ? Number(currentLane.dataset.dragPageIndex ?? 0)
                : null;
            categoryActiveLaneKeyRef.current = currentLane
                ? getCategoryLaneKey(currentLane.dataset.dragPageIndex, currentLane.dataset.dragColumnIndex)
                : null;
            categoryPageSwitchOriginXRef.current = pointer?.x
                ?? (currentElement ? currentElement.getBoundingClientRect().left : null);
        },
        [createProductOrderSnapshot, getRenderedDragElement, initializeLiveProductOrder]
    );

    const moveGroupedProductRef = useCallback((product: Product, targetCategory: string, patch: Partial<Product> = {}) => {
        const updatedProduct = { ...product, ...patch, category: targetCategory };
        Object.keys(groupedProductsRef.current).forEach((category) => {
            groupedProductsRef.current[category] = groupedProductsRef.current[category].filter((item) => item.id !== product.id);
        });
        groupedProductsRef.current[targetCategory] = groupedProductsRef.current[targetCategory] || [];
        if (!groupedProductsRef.current[targetCategory].some((item) => item.id === product.id)) {
            groupedProductsRef.current[targetCategory].push(updatedProduct);
        }
    }, []);

    const setActiveProductGroup = useCallback((productId: string, group: string) => {
        freeTextActiveCategoryRef.current[productId] = group;
        const currentItem = draggedItemRef.current;
        if (currentItem?.type === 'product' && currentItem.id === productId) {
            if (currentItem.group === group) return;
            const nextItem = { ...currentItem, group };
            draggedItemRef.current = nextItem;
            setDraggedItem(nextItem);
        }
    }, []);

    const findVisibleNeighborIndex = useCallback(
        (order: string[], currentIndex: number, step: -1 | 1, type: DragType, group?: string) => {
            for (let index = currentIndex + step; index >= 0 && index < order.length; index += step) {
                if (getRenderedDragElement(type, order[index], group)) {
                    return index;
                }
            }
            return -1;
        },
        [getRenderedDragElement]
    );

    const shouldSwapWithNeighbor = useCallback(
        (
            currentRect: DOMRect,
            neighborRect: DOMRect,
            pointer: { x: number; y: number },
            direction: 'prev' | 'next'
        ) => {
            const horizontalDistance = Math.abs(neighborRect.left - currentRect.left);
            const verticalDistance = Math.abs(neighborRect.top - currentRect.top);
            const usesHorizontalAxis = horizontalDistance > verticalDistance;
            const size = usesHorizontalAxis ? neighborRect.width : neighborRect.height;
            const center = usesHorizontalAxis
                ? neighborRect.left + neighborRect.width / 2
                : neighborRect.top + neighborRect.height / 2;
            const pointerValue = usesHorizontalAxis ? pointer.x : pointer.y;
            const buffer = Math.min(18, Math.max(6, size * 0.12));

            return direction === 'next'
                ? pointerValue > center + buffer
                : pointerValue < center - buffer;
        },
        []
    );

    const getOrderedCategoryTargets = useCallback((): CategoryTarget[] => {
        if (typeof document === 'undefined') return [];

        const scope = escapeSelectorValue(dragScope);
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                `[data-drag-scope="${scope}"][data-drag-type="category"][data-drag-id][data-drag-flow-index]`
            )
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => ({
                element,
                id: element.dataset.dragId || '',
                flowIndex: Number(element.dataset.dragFlowIndex ?? Number.MAX_SAFE_INTEGER),
                laneKey: getCategoryLaneKey(element.dataset.dragPageIndex, element.dataset.dragColumnIndex),
                rect: element.getBoundingClientRect(),
            }))
            .filter((target) => Boolean(target.id))
            .sort((left, right) => {
                return left.flowIndex - right.flowIndex;
            });
    }, [dragScope]);

    const getOrderedProductTargets = useCallback(
        (group: string, order: string[]): ProductTarget[] => {
            if (typeof document === 'undefined') return [];

            const scope = escapeSelectorValue(dragScope);
            const groupSelector = escapeSelectorValue(group);
            const orderIndexes = new Map(order.map((id, index) => [id, index]));

            return Array.from(
                document.querySelectorAll<HTMLElement>(
                    `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group="${groupSelector}"]`
                )
            )
                .filter((element) => element.isConnected && element.getClientRects().length > 0)
                .map((element) => {
                    const id = element.dataset.dragId || '';
                    const lane = element.closest<HTMLElement>(
                        '[data-drag-column-container="category"][data-drag-page-index][data-drag-column-index]'
                    );
                    return {
                        element,
                        id,
                        orderIndex: orderIndexes.get(id) ?? Number.MAX_SAFE_INTEGER,
                        laneKey: getCategoryLaneKey(lane?.dataset.dragPageIndex, lane?.dataset.dragColumnIndex),
                        rect: element.getBoundingClientRect(),
                    };
                })
                .filter((target) => Boolean(target.id) && target.orderIndex !== Number.MAX_SAFE_INTEGER)
                .sort((left, right) => left.orderIndex - right.orderIndex);
        },
        [dragScope]
    );

    const getCategoryLanes = useCallback((): CategoryLane[] => {
        if (typeof document === 'undefined') return [];

        const scope = escapeSelectorValue(dragScope);
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                `[data-drag-scope="${scope}"][data-drag-column-container="category"][data-drag-page-index][data-drag-column-index]`
            )
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => {
                const rect = element.getBoundingClientRect();
                const pageElement = element.closest<HTMLElement>('[data-drag-page-container="category"][data-drag-page-index]');
                const pageRect = pageElement?.getBoundingClientRect();
                const scale = pageRect && pageRect.height > 0 ? pageRect.height / A4_HEIGHT_PX : 1;
                const margins = resolveMenuMargins(style);
                const topPadding = margins.top * scale;
                const bottomPadding = margins.bottom * scale;
                const pageSafeBottom = pageRect
                    ? pageRect.bottom - (bottomPadding + (SAFETY_BUFFER * scale))
                    : rect.bottom;
                const top = pageRect ? Math.max(rect.top, pageRect.top + topPadding) : rect.top;
                const bottom = Math.max(top, pageRect ? pageSafeBottom : rect.bottom);

                return {
                    element,
                    key: getCategoryLaneKey(element.dataset.dragPageIndex, element.dataset.dragColumnIndex),
                    pageIndex: Number(element.dataset.dragPageIndex ?? 0),
                    columnIndex: Number(element.dataset.dragColumnIndex ?? 0),
                    rect: DOMRect.fromRect({
                        x: rect.left,
                        y: top,
                        width: rect.width,
                        height: bottom - top,
                    }),
                };
            })
            .sort((left, right) => {
                if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex;
                return left.columnIndex - right.columnIndex;
            });
    }, [dragScope, style]);

    const getCategoryPages = useCallback((): CategoryPage[] => {
        if (typeof document === 'undefined') return [];

        const scope = escapeSelectorValue(dragScope);
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                `[data-drag-scope="${scope}"][data-drag-page-container="category"][data-drag-page-index]`
            )
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => ({
                pageIndex: Number(element.dataset.dragPageIndex ?? 0),
                rect: element.getBoundingClientRect(),
            }))
            .sort((left, right) => left.pageIndex - right.pageIndex);
    }, [dragScope]);

    const getCurrentCategoryAssignments = useCallback(() => (
        getOrderedCategoryTargets().reduce<Record<string, CategoryPlacementAssignment>>((acc, target) => {
            acc[target.id] = {
                pageIndex: Number(target.element.dataset.dragPageIndex ?? 0),
                columnIndex: Number(target.element.dataset.dragColumnIndex ?? 0),
            };
            return acc;
        }, {})
    ), [getOrderedCategoryTargets]);

    const initializeCategoryDragState = useCallback(
        (categoryId: string, pointer: { x: number; y: number }) => {
            initializeLiveCategoryOrder([...sortedCategoriesRef.current]);
            const pageAssignments = getCurrentCategoryAssignments();
            initializeLiveCategoryPageAssignments(pageAssignments);

            const currentElement = getRenderedDragElement('category', categoryId);
            const currentRect = currentElement?.getBoundingClientRect();
            const currentPage = currentElement?.closest<HTMLElement>('[data-drag-page-container="category"]');
            const currentPageRect = currentPage?.getBoundingClientRect();
            const currentScale = currentPageRect && currentPageRect.width > 0
                ? Math.max(0.001, currentPageRect.width / A4_WIDTH_PX)
                : 1;
            categoryPointerOffsetYRef.current = currentRect
                ? Math.max(0, Math.min(currentRect.height, pointer.y - currentRect.top))
                : 0;
            categoryDraggedHeightRef.current = currentRect
                ? currentRect.height / currentScale
                : null;
            const currentPositions = { ...(style.categoryPositions || {}) };
            setLiveCategoryPositions(currentPositions);
            liveCategoryPositionsRef.current = currentPositions;
            categorySwapLockRef.current = null;
            categoryActivePageIndexRef.current = currentElement
                ? Number(currentElement.dataset.dragPageIndex ?? 0)
                : null;
            categoryActiveLaneKeyRef.current = currentElement
                ? getCategoryLaneKey(currentElement.dataset.dragPageIndex, currentElement.dataset.dragColumnIndex)
                : null;
            categoryPageSwitchOriginXRef.current = pointer.x;
        },
        [getCurrentCategoryAssignments, getRenderedDragElement, initializeLiveCategoryOrder, initializeLiveCategoryPageAssignments, style.categoryPositions]
    );

    const rebaseCategoryAfterSwap = useCallback((rebase: CategorySwapRebase) => {
        if (typeof window === 'undefined') return;
        if (categorySwapRebaseFrameRef.current !== null) {
            window.cancelAnimationFrame(categorySwapRebaseFrameRef.current);
        }

        categorySwapRebaseRef.current = rebase;
        let attempts = 0;
        const applyRebase = () => {
            const current = categorySwapRebaseRef.current;
            if (!current) {
                categorySwapRebaseFrameRef.current = null;
                return;
            }

            const sourceElement = getRenderedDragElement('category', current.sourceId);
            const sourceRect = sourceElement?.getBoundingClientRect();
            const pageElement = sourceElement?.closest<HTMLElement>(
                '[data-drag-page-container="category"][data-drag-page-index]'
            );
            const pageRect = pageElement?.getBoundingClientRect();
            if (!sourceElement || !sourceRect || !pageRect) {
                attempts += 1;
                if (attempts < 3) {
                    categorySwapRebaseFrameRef.current = window.requestAnimationFrame(applyRebase);
                } else {
                    categorySwapRebaseFrameRef.current = null;
                    categorySwapRebaseRef.current = null;
                }
                return;
            }

            const scale = Math.max(0.001, pageRect.width / A4_WIDTH_PX);
            categoryPointerOffsetYRef.current = Math.max(
                0,
                Math.min(sourceRect.height, current.pointer.y - sourceRect.top),
            );
            categoryDraggedHeightRef.current = sourceRect.height / scale;
            categoryActivePageIndexRef.current = Number(sourceElement.dataset.dragPageIndex ?? 0);
            categoryActiveLaneKeyRef.current = getCategoryLaneKey(
                sourceElement.dataset.dragPageIndex,
                sourceElement.dataset.dragColumnIndex,
            );
            categorySwapRebaseFrameRef.current = null;
            categorySwapRebaseRef.current = null;
        };

        categorySwapRebaseFrameRef.current = window.requestAnimationFrame(applyRebase);
    }, [getRenderedDragElement]);

    const updateDraggedCategoryPosition = useCallback((
        categoryId: string,
        pointer: { x: number; y: number },
        activePageIndex: number,
        activeColumnIndex: number,
        activeLaneKey: string,
    ) => {
        const lane = getCategoryLanes().find((candidate) => candidate.key === activeLaneKey);
        const page = document.querySelector<HTMLElement>(
            `[data-drag-scope="${escapeSelectorValue(dragScope)}"][data-drag-page-container="category"][data-drag-page-index="${activePageIndex}"]`,
        );
        const element = getRenderedDragElement('category', categoryId);
        if (!lane || !page || !element) return false;

        const pageRect = page.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const scale = Math.max(0.001, pageRect.width / A4_WIDTH_PX);
        const elementHeight = elementRect.height > 0
            ? elementRect.height
            : (categoryDraggedHeightRef.current || 0) * scale;
        if (elementHeight > 0) {
            categoryDraggedHeightRef.current = elementHeight / scale;
        }
        const pointerOffset = categoryPointerOffsetYRef.current !== null
            ? categoryPointerOffsetYRef.current
            : Math.min(24 * scale, elementHeight / 2);
        const minimumTop = lane.rect.top;
        const maximumBottom = lane.rect.bottom;
        if (elementHeight > maximumBottom - minimumTop) return false;

        const desiredTop = Math.max(
            minimumTop,
            Math.min(maximumBottom - elementHeight, pointer.y - pointerOffset),
        );

        const previousPosition = liveCategoryPositionsRef.current?.[categoryId];
        const renderedPageIndex = Number(element.dataset.dragPageIndex ?? activePageIndex);
        const renderedColumnIndex = Number(element.dataset.dragColumnIndex ?? activeColumnIndex);
        const remainsInNaturalLane = (
            renderedPageIndex === activePageIndex
            && renderedColumnIndex === activeColumnIndex
        );
        const freePlacementActivationDistance = (STANDARD_GAP + 4) * scale;
        if (
            !previousPosition
            && remainsInNaturalLane
            && Math.abs(desiredTop - elementRect.top) <= freePlacementActivationDistance
        ) {
            return true;
        }

        const obstacles = getOrderedCategoryTargets()
            .filter((target) => target.id !== categoryId && target.laneKey === activeLaneKey)
            .sort((left, right) => left.rect.top - right.rect.top);
        const desiredBottom = desiredTop + elementHeight;
        const overlapsCategory = obstacles.some((target) => (
            desiredTop < target.rect.bottom - 0.5
            && desiredBottom > target.rect.top + 0.5
        ));
        if (overlapsCategory) return false;

        const nextPosition: CategoryPosition = {
            pageIndex: activePageIndex,
            columnIndex: activeColumnIndex,
            y: Math.max(0, Math.round((desiredTop - pageRect.top) / scale)),
        };
        if (
            previousPosition?.pageIndex === nextPosition.pageIndex
            && previousPosition?.columnIndex === nextPosition.columnIndex
            && previousPosition?.y === nextPosition.y
        ) {
            return true;
        }

        const nextPositions = {
            ...(liveCategoryPositionsRef.current || style.categoryPositions || {}),
            [categoryId]: nextPosition,
        };
        liveCategoryPositionsRef.current = nextPositions;
        setLiveCategoryPositions(nextPositions);
        hasDragMutationRef.current = true;
        return true;
    }, [dragScope, getCategoryLanes, getOrderedCategoryTargets, getRenderedDragElement, style.categoryPositions]);

    const ensureFreeTextCategoryDragState = useCallback(
        (
            product: Product,
            pointer: { x: number; y: number },
            anchorCategory: string = product.category,
            position: 'before' | 'after' = 'after',
            marginTop: number = product.customMarginTop || STANDARD_GAP
        ) => {
            let freeTextCategory = freeTextActiveCategoryRef.current[product.id] || product.category;

            if (!freeTextCategory.startsWith(FREE_TEXT_PREFIX)) {
                freeTextCategory = moveFreeTextToGhostSlot({
                    products,
                    sortedCategories: sortedCategoriesRef.current,
                    groupedProducts: groupedProductsRef.current,
                    onUpdateProduct,
                    onUpdateProducts,
                    onStyleUpdate,
                }, product, anchorCategory, position, marginTop);

                const currentOrder = liveCategoryOrderRef.current || sortedCategoriesRef.current;
                const nextOrder = currentOrder.filter((category) => category !== freeTextCategory);
                const anchorIndex = nextOrder.indexOf(anchorCategory);
                const insertionIndex = anchorIndex === -1
                    ? nextOrder.length
                    : position === 'before'
                        ? anchorIndex
                        : anchorIndex + 1;
                nextOrder.splice(insertionIndex, 0, freeTextCategory);

                sortedCategoriesRef.current = nextOrder;
                setLiveCategoryOrder(nextOrder);
                liveCategoryOrderRef.current = nextOrder;

                const updatedProduct = { ...product, category: freeTextCategory, customMarginTop: marginTop };
                const nextGrouped = { ...groupedProductsRef.current };
                nextGrouped[product.category] = (nextGrouped[product.category] || []).filter((item) => item.id !== product.id);
                nextGrouped[freeTextCategory] = [updatedProduct];
                groupedProductsRef.current = nextGrouped;

                const nextLiveProductOrder = { ...(liveProductOrderRef.current || createProductOrderSnapshot()) };
                Object.keys(nextLiveProductOrder).forEach((category) => {
                    nextLiveProductOrder[category] = nextLiveProductOrder[category].filter((id) => id !== product.id);
                });
                nextLiveProductOrder[freeTextCategory] = [product.id];
                liveProductOrderRef.current = nextLiveProductOrder;
                setLiveProductOrder(nextLiveProductOrder);

                freeTextActiveCategoryRef.current[product.id] = freeTextCategory;
                freeTextDragSlotRef.current = {
                    category: freeTextCategory,
                    marginTop: Math.max(0, Math.round(Number(marginTop) || 0)),
                };
                setActiveProductGroup(product.id, freeTextCategory);
                hasDragMutationRef.current = true;
            } else {
                freeTextActiveCategoryRef.current[product.id] = freeTextCategory;
                setActiveProductGroup(product.id, freeTextCategory);
            }

            if (!liveCategoryOrderRef.current) {
                initializeLiveCategoryOrder([...sortedCategoriesRef.current]);
            }

            if (!liveCategoryPageAssignmentsRef.current || !liveCategoryPageAssignmentsRef.current[freeTextCategory]) {
                const assignments = liveCategoryPageAssignmentsRef.current || getCurrentCategoryAssignments();
                const lanes = getCategoryLanes();
                const fallbackLane = lanes.length > 0
                    ? lanes.reduce((best, lane) => {
                        const bestCenterX = best.rect.left + (best.rect.width / 2);
                        const bestCenterY = best.rect.top + (best.rect.height / 2);
                        const laneCenterX = lane.rect.left + (lane.rect.width / 2);
                        const laneCenterY = lane.rect.top + (lane.rect.height / 2);
                        const bestDistance = Math.hypot(pointer.x - bestCenterX, pointer.y - bestCenterY);
                        const laneDistance = Math.hypot(pointer.x - laneCenterX, pointer.y - laneCenterY);
                        return laneDistance < bestDistance ? lane : best;
                    })
                    : undefined;
                const pointerLane = lanes.find((lane) => (
                    pointer.x >= lane.rect.left &&
                    pointer.x <= lane.rect.right &&
                    pointer.y >= lane.rect.top &&
                    pointer.y <= lane.rect.bottom
                )) || fallbackLane;

                if (pointerLane) {
                    assignments[freeTextCategory] = {
                        pageIndex: pointerLane.pageIndex,
                        columnIndex: pointerLane.columnIndex,
                    };
                    categoryActivePageIndexRef.current = pointerLane.pageIndex;
                    categoryActiveLaneKeyRef.current = pointerLane.key;
                }

                initializeLiveCategoryPageAssignments(assignments);
            }

            return freeTextCategory;
        },
        [
            createProductOrderSnapshot,
            getCategoryLanes,
            getCurrentCategoryAssignments,
            initializeLiveCategoryOrder,
            initializeLiveCategoryPageAssignments,
            onStyleUpdate,
            onUpdateProduct,
            onUpdateProducts,
            products,
            setActiveProductGroup,
        ]
    );

    const resolveCategoryPageIndex = useCallback(
        (pointer: { x: number; y: number }, fallbackPageIndex: number | null, useFullPageHitArea: boolean = false) => {
            const pages = getCategoryPages();
            if (pages.length === 0) return fallbackPageIndex;

            const exactPage = pages.find((page) => {
                const inset = useFullPageHitArea
                    ? 0
                    : Math.min(CATEGORY_PAGE_SWITCH_INSET_PX, Math.max(28, page.rect.width * 0.12));
                return (
                    pointer.x >= page.rect.left + inset &&
                    pointer.x <= page.rect.right - inset &&
                    pointer.y >= page.rect.top &&
                    pointer.y <= page.rect.bottom
                );
            });

            if (!exactPage) {
                return fallbackPageIndex ?? pages[0].pageIndex;
            }

            if (useFullPageHitArea) return exactPage.pageIndex;

            if (fallbackPageIndex === null || exactPage.pageIndex === fallbackPageIndex) {
                return exactPage.pageIndex;
            }

            const switchOriginX = categoryPageSwitchOriginXRef.current ?? pointer.x;
            const movedEnoughHorizontally = Math.abs(pointer.x - switchOriginX) >= CATEGORY_PAGE_SWITCH_THRESHOLD_PX;
            return movedEnoughHorizontally ? exactPage.pageIndex : fallbackPageIndex;
        },
        [getCategoryPages]
    );

    const resolveCategoryLaneKey = useCallback(
        (pointer: { x: number; y: number }, activePageIndex: number, fallbackLaneKey: string | null, useFullLaneHitArea: boolean = false) => {
            const lanes = getCategoryLanes().filter((lane) => lane.pageIndex === activePageIndex);
            if (lanes.length === 0) return fallbackLaneKey;

            const exactLane = lanes.find((lane) => {
                const inset = useFullLaneHitArea
                    ? 0
                    : Math.min(CATEGORY_COLUMN_SWITCH_INSET_PX, Math.max(12, lane.rect.width * 0.22));
                return pointer.x >= lane.rect.left + inset && pointer.x <= lane.rect.right - inset;
            });

            if (exactLane) return exactLane.key;
            if (fallbackLaneKey && lanes.some((lane) => lane.key === fallbackLaneKey)) return fallbackLaneKey;

            return lanes.reduce((best, lane) => {
                const bestDistance = Math.abs(pointer.x - (best.rect.left + (best.rect.width / 2)));
                const laneDistance = Math.abs(pointer.x - (lane.rect.left + (lane.rect.width / 2)));
                return laneDistance < bestDistance ? lane : best;
            }).key;
        },
        [getCategoryLanes]
    );

    const reorderCategoryByPointer = useCallback(
        (pointer: { x: number; y: number }, options: { commitImmediately?: boolean } = {}) => {
            const currentDragItem = draggedItemRef.current;
            if (!currentDragItem || currentDragItem.type !== 'category') return;
            const commitImmediately = options.commitImmediately ?? true;

            if (dragSourceContextRef.current === 'product-designer') {
                const startPointer = dragStartPointerRef.current;
                if (
                    startPointer &&
                    Math.hypot(pointer.x - startPointer.x, pointer.y - startPointer.y) <
                    PRODUCT_DESIGNER_CATEGORY_REORDER_MIN_DISTANCE_PX
                ) {
                    return;
                }
            }

            const currentOrder = liveCategoryOrderRef.current || sortedCategoriesRef.current;
            const currentElement = getRenderedDragElement('category', currentDragItem.id);
            const currentAssignment = liveCategoryPageAssignmentsRef.current?.[currentDragItem.id];
            if (!currentElement && !currentAssignment) return;

            const activeSwapLock = categorySwapLockRef.current;
            if (activeSwapLock?.sourceId === currentDragItem.id && currentElement) {
                if (activeSwapLock.freeCollision) {
                    const { bounds } = activeSwapLock.freeCollision;
                    const pointerStillInsideCollision = (
                        pointer.x >= bounds.left
                        && pointer.x <= bounds.right
                        && pointer.y >= bounds.top
                        && pointer.y <= bounds.bottom
                    );
                    if (!pointerStillInsideCollision) categorySwapLockRef.current = null;
                } else {
                    const lockedTargetElement = getRenderedDragElement('category', activeSwapLock.targetId);
                    const sourceRect = currentElement.getBoundingClientRect();
                    const targetRect = lockedTargetElement?.getBoundingClientRect();
                    const containersAreSeparated = Boolean(
                        targetRect
                        && (
                            sourceRect.right < targetRect.left - 0.5
                            || sourceRect.left > targetRect.right + 0.5
                            || sourceRect.bottom < targetRect.top - 0.5
                            || sourceRect.top > targetRect.bottom + 0.5
                        )
                    );
                    if (containersAreSeparated) categorySwapLockRef.current = null;
                }
            }

            const currentPageIndex =
                categoryActivePageIndexRef.current ??
                currentAssignment?.pageIndex ??
                Number(currentElement?.dataset.dragPageIndex ?? 0);
            const activePageIndex = resolveCategoryPageIndex(pointer, currentPageIndex, true);
            if (activePageIndex === null) return;

            if (activePageIndex !== currentPageIndex) {
                categoryPageSwitchOriginXRef.current = pointer.x;
            }
            categoryActivePageIndexRef.current = activePageIndex;

            const currentLaneKey =
                categoryActiveLaneKeyRef.current ||
                (currentElement
                    ? getCategoryLaneKey(currentElement.dataset.dragPageIndex, currentElement.dataset.dragColumnIndex)
                    : currentAssignment
                        ? getCategoryLaneKey(String(currentAssignment.pageIndex), String(currentAssignment.columnIndex))
                        : null);
            const activeLaneKey = resolveCategoryLaneKey(pointer, activePageIndex, currentLaneKey, true);
            if (!activeLaneKey) return;

            categoryActiveLaneKeyRef.current = activeLaneKey;
            if (
                categorySwapLockRef.current?.freeCollision
                && categorySwapLockRef.current.freeCollision.laneKey !== activeLaneKey
            ) {
                categorySwapLockRef.current = null;
            }

            const activeColumnIndex = Number(activeLaneKey.split(':')[1] ?? 0);
            const currentAssignments = liveCategoryPageAssignmentsRef.current || {};
            const currentPlacement = currentAssignments[currentDragItem.id];
            const updateDraggedAssignment = () => {
                if (
                    currentPlacement?.pageIndex === activePageIndex &&
                    currentPlacement?.columnIndex === activeColumnIndex
                ) return;
                const nextAssignments = {
                    ...currentAssignments,
                    [currentDragItem.id]: {
                        pageIndex: activePageIndex,
                        columnIndex: activeColumnIndex,
                    },
                };
                setLiveCategoryPageAssignments(nextAssignments);
                liveCategoryPageAssignmentsRef.current = nextAssignments;
            };

            const orderWithoutDragged = currentOrder.filter((id) => id !== currentDragItem.id);
            const orderedTargets = getOrderedCategoryTargets().filter((target) => target.id !== currentDragItem.id);
            const laneTargets = orderedTargets
                .filter((target) => target.laneKey === activeLaneKey)
                .sort((left, right) => left.rect.top - right.rect.top);
            const pointerTarget = laneTargets.find((target) => (
                pointer.x >= target.rect.left
                && pointer.x <= target.rect.right
                && pointer.y >= target.rect.top
                && pointer.y <= target.rect.bottom
            ));
            const currentSwapLock = categorySwapLockRef.current;
            if (
                pointerTarget
                && currentSwapLock?.sourceId === currentDragItem.id
                && currentSwapLock.targetId !== pointerTarget.id
            ) {
                categorySwapLockRef.current = null;
            }
            const activeFreeCollisionLock = categorySwapLockRef.current;
            if (
                activeFreeCollisionLock?.sourceId === currentDragItem.id
                && activeFreeCollisionLock.freeCollision
            ) {
                return;
            }
            const categoryDropTarget = (
                pointerTarget
                && !(
                    categorySwapLockRef.current?.sourceId === currentDragItem.id
                    && categorySwapLockRef.current.targetId === pointerTarget.id
                )
            ) ? pointerTarget : null;

            if (!categoryDropTarget) {
                const positionUpdated = updateDraggedCategoryPosition(
                    currentDragItem.id,
                    pointer,
                    activePageIndex,
                    activeColumnIndex,
                    activeLaneKey,
                );
                if (positionUpdated) updateDraggedAssignment();
                return;
            }

            const targetCenterY = categoryDropTarget.rect.top + (categoryDropTarget.rect.height / 2);
            const targetPosition: 'before' | 'after' = pointer.y < targetCenterY ? 'before' : 'after';
            const targetIndex = orderWithoutDragged.indexOf(categoryDropTarget.id);
            if (targetIndex === -1) return;
            const desiredInsertionIndex = targetIndex + (targetPosition === 'after' ? 1 : 0);
            const newOrder = moveItemToInsertionIndex(currentOrder, currentDragItem.id, desiredInsertionIndex);
            if (areOrdersEqual(newOrder, currentOrder)) return;

            const currentPositions = liveCategoryPositionsRef.current || style.categoryPositions || {};
            const sourceWasFree = currentElement?.dataset.freePositioned === 'true';
            const targetWasFree = categoryDropTarget.element.dataset.freePositioned === 'true';
            const exchangesFreeSlots = sourceWasFree || targetWasFree;
            const getRenderedCategoryPosition = (
                element: HTMLElement | null,
                rect: DOMRect | null,
            ): CategoryPosition | null => {
                const pageElement = element?.closest<HTMLElement>(
                    '[data-drag-page-container="category"][data-drag-page-index]'
                );
                const pageRect = pageElement?.getBoundingClientRect();
                if (!element || !rect || !pageRect) return null;
                const renderedPageIndex = Number(element.dataset.dragPageIndex);
                const renderedColumnIndex = Number(element.dataset.dragColumnIndex);
                if (!Number.isFinite(renderedPageIndex) || !Number.isFinite(renderedColumnIndex)) return null;
                const scale = Math.max(0.001, pageRect.width / A4_WIDTH_PX);
                return {
                    pageIndex: renderedPageIndex,
                    columnIndex: renderedColumnIndex,
                    y: Math.max(0, Math.round((rect.top - pageRect.top) / scale)),
                };
            };
            const sourceRenderedPosition = exchangesFreeSlots
                ? getRenderedCategoryPosition(
                    currentElement,
                    currentElement?.getBoundingClientRect() || null,
                )
                : null;
            const targetRenderedPosition = exchangesFreeSlots
                ? getRenderedCategoryPosition(
                    categoryDropTarget.element,
                    categoryDropTarget.rect,
                )
                : null;
            if (exchangesFreeSlots && (!sourceRenderedPosition || !targetRenderedPosition)) return;

            const sourceCollisionAssignment = sourceRenderedPosition
                ? {
                    pageIndex: sourceRenderedPosition.pageIndex,
                    columnIndex: sourceRenderedPosition.columnIndex,
                }
                : currentPlacement || {
                    pageIndex: activePageIndex,
                    columnIndex: activeColumnIndex,
                };
            const targetAssignment = targetRenderedPosition
                ? {
                    pageIndex: targetRenderedPosition.pageIndex,
                    columnIndex: targetRenderedPosition.columnIndex,
                }
                : currentAssignments[categoryDropTarget.id] || {
                    pageIndex: Number(categoryDropTarget.element.dataset.dragPageIndex ?? activePageIndex),
                    columnIndex: Number(categoryDropTarget.element.dataset.dragColumnIndex ?? activeColumnIndex),
                };
            const sourceCollisionPosition = sourceWasFree ? sourceRenderedPosition : null;
            const targetFreePosition = targetWasFree ? targetRenderedPosition : null;
            const nextPositions = { ...currentPositions };
            if (exchangesFreeSlots) {
                if (targetFreePosition) nextPositions[currentDragItem.id] = { ...targetFreePosition };
                else delete nextPositions[currentDragItem.id];
                if (sourceCollisionPosition) nextPositions[categoryDropTarget.id] = { ...sourceCollisionPosition };
                else delete nextPositions[categoryDropTarget.id];
            } else {
                delete nextPositions[currentDragItem.id];
                delete nextPositions[categoryDropTarget.id];
            }
            const positionsChanged = (
                JSON.stringify(nextPositions[currentDragItem.id]) !== JSON.stringify(currentPositions[currentDragItem.id])
                || JSON.stringify(nextPositions[categoryDropTarget.id]) !== JSON.stringify(currentPositions[categoryDropTarget.id])
            );
            const nextAssignments = {
                ...currentAssignments,
                [currentDragItem.id]: { ...targetAssignment },
                ...(exchangesFreeSlots
                    ? { [categoryDropTarget.id]: { ...sourceCollisionAssignment } }
                    : {}),
            };

            categorySwapLockRef.current = {
                sourceId: currentDragItem.id,
                targetId: categoryDropTarget.id,
                position: targetPosition,
                ...(exchangesFreeSlots
                    ? {
                        freeCollision: {
                            laneKey: activeLaneKey,
                            bounds: {
                                top: categoryDropTarget.rect.top,
                                right: categoryDropTarget.rect.right,
                                bottom: categoryDropTarget.rect.bottom,
                                left: categoryDropTarget.rect.left,
                            },
                        },
                    }
                    : {}),
            };
            flushSync(() => {
                if (positionsChanged) {
                    liveCategoryPositionsRef.current = nextPositions;
                    setLiveCategoryPositions(nextPositions);
                }
                liveCategoryPageAssignmentsRef.current = nextAssignments;
                setLiveCategoryPageAssignments(nextAssignments);
                hasDragMutationRef.current = true;
                liveCategoryOrderRef.current = newOrder;
                setLiveCategoryOrder(newOrder);
            });

            categoryActivePageIndexRef.current = targetAssignment.pageIndex;
            categoryActiveLaneKeyRef.current = getCategoryLaneKey(
                String(targetAssignment.pageIndex),
                String(targetAssignment.columnIndex),
            );
            rebaseCategoryAfterSwap({
                sourceId: currentDragItem.id,
                pointer,
            });

            if (!commitImmediately) return;
            onCommitCategoryOrder?.(newOrder);
            if (liveCategoryPageAssignmentsRef.current && onStyleUpdate) {
                const nextPageBreaks = newOrder.reduce<string[]>((breaks, category, index, order) => {
                    if (index === 0) return breaks;
                    const previousCategory = order[index - 1];
                    const previousPage = liveCategoryPageAssignmentsRef.current?.[previousCategory]?.pageIndex ?? 0;
                    const currentPage = liveCategoryPageAssignmentsRef.current?.[category]?.pageIndex ?? previousPage;
                    if (currentPage > previousPage) breaks.push(category);
                    return breaks;
                }, []);
                onStyleUpdate((prev) => ({ ...prev, pageBreaks: nextPageBreaks, name: 'Custom' }));
            }
        },
        [getOrderedCategoryTargets, getRenderedDragElement, onCommitCategoryOrder, onStyleUpdate, rebaseCategoryAfterSwap, resolveCategoryLaneKey, resolveCategoryPageIndex, style.categoryPositions, updateDraggedCategoryPosition]
    );

    const syncFreeTextCategoryOrderToLane = useCallback(
        (freeTextCategory: string, pointer: { x: number; y: number }, activeLaneKey: string) => {
            const currentOrder = liveCategoryOrderRef.current || sortedCategoriesRef.current;
            if (!currentOrder.includes(freeTextCategory)) return;

            const orderWithoutDragged = currentOrder.filter((id) => id !== freeTextCategory);
            const orderedTargets = getOrderedCategoryTargets()
                .filter((target) => target.id !== freeTextCategory && !target.id.startsWith(FREE_TEXT_PREFIX));
            const laneTargets = orderedTargets.filter((target) => target.laneKey === activeLaneKey);
            let desiredInsertionIndex = orderWithoutDragged.length;

            if (laneTargets.length === 0) {
                const lanes = getCategoryLanes();
                const activeLaneIndex = lanes.findIndex((lane) => lane.key === activeLaneKey);
                const getLaneIndex = (target: CategoryTarget) => lanes.findIndex((lane) => lane.key === target.laneKey);
                const nextTarget = activeLaneIndex === -1
                    ? null
                    : orderedTargets.find((target) => getLaneIndex(target) > activeLaneIndex);
                const previousTarget = activeLaneIndex === -1
                    ? null
                    : [...orderedTargets].reverse().find((target) => {
                        const laneIndex = getLaneIndex(target);
                        return laneIndex !== -1 && laneIndex < activeLaneIndex;
                    });

                if (nextTarget) {
                    const nextIndex = orderWithoutDragged.indexOf(nextTarget.id);
                    desiredInsertionIndex = nextIndex === -1 ? orderWithoutDragged.length : nextIndex;
                } else if (previousTarget) {
                    const previousIndex = orderWithoutDragged.indexOf(previousTarget.id);
                    desiredInsertionIndex = previousIndex === -1 ? orderWithoutDragged.length : previousIndex + 1;
                }
            } else {
                for (const target of laneTargets) {
                    const targetIndex = orderWithoutDragged.indexOf(target.id);
                    if (targetIndex === -1) continue;

                    const centerY = target.rect.top + (target.rect.height / 2);
                    if (pointer.y < centerY) {
                        desiredInsertionIndex = targetIndex;
                        break;
                    }

                    desiredInsertionIndex = targetIndex + 1;
                }
            }

            const currentIndex = currentOrder.indexOf(freeTextCategory);
            const previousFreeTextCategory = currentIndex > 0
                ? [...currentOrder.slice(0, currentIndex)].reverse().find((category) => category.startsWith(FREE_TEXT_PREFIX))
                : undefined;
            const nextFreeTextCategory = currentIndex >= 0
                ? currentOrder.slice(currentIndex + 1).find((category) => category.startsWith(FREE_TEXT_PREFIX))
                : undefined;
            const minimumInsertionIndex = previousFreeTextCategory
                ? orderWithoutDragged.indexOf(previousFreeTextCategory) + 1
                : 0;
            const nextFreeTextIndex = nextFreeTextCategory
                ? orderWithoutDragged.indexOf(nextFreeTextCategory)
                : -1;
            const maximumInsertionIndex = nextFreeTextIndex === -1
                ? orderWithoutDragged.length
                : nextFreeTextIndex;
            desiredInsertionIndex = Math.max(
                minimumInsertionIndex,
                Math.min(desiredInsertionIndex, maximumInsertionIndex)
            );

            const nextOrder = moveItemToInsertionIndex(currentOrder, freeTextCategory, desiredInsertionIndex);
            if (areOrdersEqual(nextOrder, currentOrder)) return;

            sortedCategoriesRef.current = nextOrder;
            liveCategoryOrderRef.current = nextOrder;
            setLiveCategoryOrder(nextOrder);
            hasDragMutationRef.current = true;
        },
        [getCategoryLanes, getOrderedCategoryTargets]
    );

    const resolveProductInsertionIndex = useCallback(
        (
            pointer: { x: number; y: number },
            _movement: { x: number; y: number },
            targets: ProductTarget[],
            orderWithoutDragged: string[]
        ) => {
            if (targets.length === 0) return orderWithoutDragged.length;

            const sortedTargets = [...targets].sort((left, right) => {
                if (Math.abs(left.rect.top - right.rect.top) > 8) return left.rect.top - right.rect.top;
                return left.rect.left - right.rect.left;
            });
            const rows: ProductTarget[][] = [];

            sortedTargets.forEach((target) => {
                const targetCenterY = target.rect.top + target.rect.height / 2;
                const row = rows.find((candidateRow) => {
                    const rowRect = candidateRow[0].rect;
                    const rowCenterY = rowRect.top + rowRect.height / 2;
                    const tolerance = Math.max(8, Math.min(28, rowRect.height * 0.45));
                    return Math.abs(targetCenterY - rowCenterY) <= tolerance;
                });

                if (row) row.push(target);
                else rows.push([target]);
            });

            const orderedRows = rows
                .map((row) => [...row].sort((left, right) => left.rect.left - right.rect.left))
                .sort((left, right) => left[0].rect.top - right[0].rect.top);

            const rowMetrics = orderedRows.map((row) => {
                const top = Math.min(...row.map((target) => target.rect.top));
                const bottom = Math.max(...row.map((target) => target.rect.bottom));
                return {
                    row,
                    top,
                    bottom,
                    centerY: (top + bottom) / 2,
                };
            });

            const activeRow = rowMetrics.reduce((best, candidate) => (
                Math.abs(pointer.y - candidate.centerY) < Math.abs(pointer.y - best.centerY)
                    ? candidate
                    : best
            ), rowMetrics[0]);

            let slotIndex = activeRow.row.findIndex((target) => pointer.x < target.rect.left + (target.rect.width / 2));
            if (slotIndex === -1) slotIndex = activeRow.row.length;
            if (pointer.y > activeRow.bottom) slotIndex = Math.min(activeRow.row.length, slotIndex + 1);

            const targetAtSlot = activeRow.row[slotIndex];
            if (targetAtSlot) {
                const targetIndex = orderWithoutDragged.indexOf(targetAtSlot.id);
                if (targetIndex !== -1) return targetIndex;
            }

            const previousTarget = activeRow.row[slotIndex - 1];
            if (previousTarget) {
                const previousIndex = orderWithoutDragged.indexOf(previousTarget.id);
                if (previousIndex !== -1) return previousIndex + 1;
            }

            return orderWithoutDragged.length;
        },
        []
    );

    const reorderProductByPointer = useCallback(
        (pointer: { x: number; y: number }, movement: { x: number; y: number }) => {
            const currentDragItem = draggedItemRef.current;
            if (!currentDragItem || currentDragItem.type !== 'product' || !currentDragItem.group) return;

            const draggedProduct = getLatestProductById(currentDragItem.id);
            if (!draggedProduct) return;

            const sourceGroup = currentDragItem.group;
            const currentLive = liveProductOrderRef.current || {};
            const baseOrder = currentLive[sourceGroup]
                ? [...currentLive[sourceGroup]]
                : groupedProductsRef.current[sourceGroup]?.map((product) => product.id) || [];
            const currentOrder = baseOrder.includes(currentDragItem.id)
                ? baseOrder
                : [...baseOrder, currentDragItem.id];
            const currentIndex = currentOrder.indexOf(currentDragItem.id);
            if (currentIndex === -1) return;

            const orderWithoutDragged = currentOrder.filter((id) => id !== currentDragItem.id);
            const currentElement = getRenderedDragElement('product', currentDragItem.id, sourceGroup)
                || getRenderedDragElement('product', currentDragItem.id);
            const currentLane = currentElement?.closest<HTMLElement>(
                '[data-drag-column-container="category"][data-drag-page-index][data-drag-column-index]'
            );
            const currentPageIndex = categoryActivePageIndexRef.current
                ?? Number(currentLane?.dataset.dragPageIndex ?? 0);
            const activePageIndex = resolveCategoryPageIndex(pointer, currentPageIndex);
            if (activePageIndex === null) return;

            if (activePageIndex !== currentPageIndex) {
                categoryPageSwitchOriginXRef.current = pointer.x;
            }
            categoryActivePageIndexRef.current = activePageIndex;

            const currentLaneKey = categoryActiveLaneKeyRef.current
                || getCategoryLaneKey(currentLane?.dataset.dragPageIndex, currentLane?.dataset.dragColumnIndex);
            const activeLaneKey = resolveCategoryLaneKey(pointer, activePageIndex, currentLaneKey);
            if (!activeLaneKey) return;
            categoryActiveLaneKeyRef.current = activeLaneKey;

            const allTargets = getOrderedProductTargets(sourceGroup, currentOrder)
                .filter((target) => target.id !== currentDragItem.id);
            const laneTargets = allTargets.filter((target) => target.laneKey === activeLaneKey);
            let desiredInsertionIndex: number;

            if (laneTargets.length > 0) {
                desiredInsertionIndex = resolveProductInsertionIndex(pointer, movement, laneTargets, orderWithoutDragged);
            } else {
                const lanes = getCategoryLanes();
                const activeLaneIndex = lanes.findIndex((lane) => lane.key === activeLaneKey);
                const laneIndexes = new Map(lanes.map((lane, index) => [lane.key, index]));
                const nextTarget = activeLaneIndex === -1
                    ? null
                    : allTargets.find((target) => (laneIndexes.get(target.laneKey) ?? -1) > activeLaneIndex);
                const previousTarget = activeLaneIndex === -1
                    ? null
                    : [...allTargets].reverse().find((target) => {
                        const laneIndex = laneIndexes.get(target.laneKey) ?? -1;
                        return laneIndex !== -1 && laneIndex < activeLaneIndex;
                    });

                if (nextTarget) {
                    const nextIndex = orderWithoutDragged.indexOf(nextTarget.id);
                    desiredInsertionIndex = nextIndex === -1 ? orderWithoutDragged.length : nextIndex;
                } else if (previousTarget) {
                    const previousIndex = orderWithoutDragged.indexOf(previousTarget.id);
                    desiredInsertionIndex = previousIndex === -1 ? orderWithoutDragged.length : previousIndex + 1;
                } else {
                    desiredInsertionIndex = Math.max(
                        0,
                        Math.min(productInsertionIndexRef.current ?? currentIndex, orderWithoutDragged.length)
                    );
                }
            }
            productInsertionIndexRef.current = desiredInsertionIndex;

            const newOrder = moveItemToInsertionIndex(currentOrder, currentDragItem.id, desiredInsertionIndex);
            if (areOrdersEqual(newOrder, currentOrder)) return;

            hasDragMutationRef.current = true;
            const nextLiveOrder = { ...currentLive, [sourceGroup]: newOrder };
            setLiveProductOrder(nextLiveOrder);
            liveProductOrderRef.current = nextLiveOrder;

            if (draggedProduct.isFreeText && onStyleUpdate) {
                onStyleUpdate((prev) => {
                    const productOrder = { ...(prev.customProductOrder || {}) };
                    Object.keys(productOrder).forEach((category) => {
                        productOrder[category] = productOrder[category].filter((id) => id !== currentDragItem.id);
                    });
                    productOrder[sourceGroup] = newOrder;
                    return { ...prev, customProductOrder: productOrder, name: 'Custom' };
                });
            } else {
                onCommitProductOrder?.(sourceGroup, newOrder);
            }
        },
        [getCategoryLanes, getLatestProductById, getOrderedProductTargets, getRenderedDragElement, onCommitProductOrder, onStyleUpdate, resolveCategoryLaneKey, resolveCategoryPageIndex, resolveProductInsertionIndex]
    );

    const getFreeTextCategoryTargetAtPointer = useCallback(
        (
            pointer: { x: number; y: number },
            productId: string,
            options: { includeFreeTextTargets?: boolean } = {}
        ): FreeTextPointerTarget | null => {
            if (typeof document === 'undefined') return null;
            const scope = escapeSelectorValue(dragScope);
            const blocksCategoryDrop = Array.from(document.querySelectorAll<HTMLElement>(
                '[data-added-image-drag="true"], #menu-title-text, #menu-subtitle-text'
            )).some((element) => {
                const rect = element.getBoundingClientRect();
                return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
            });
            if (blocksCategoryDrop) return null;
            const productTargets = Array.from(document.querySelectorAll<HTMLElement>(
                `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group]`
            ))
                .filter((element) => element.dataset.dragId !== productId)
                .map((element) => ({
                    element,
                    id: element.dataset.dragId || '',
                    category: element.dataset.dragGroup || '',
                    rect: element.getBoundingClientRect(),
                }))
                .filter((target) => (
                    target.id &&
                    target.category &&
                    (options.includeFreeTextTargets || !target.category.startsWith(FREE_TEXT_PREFIX)) &&
                    pointer.x >= target.rect.left &&
                    pointer.x <= target.rect.right &&
                    pointer.y >= target.rect.top &&
                    pointer.y <= target.rect.bottom
                ))
                .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));
            const directProduct = productTargets[0];

            if (directProduct) {
                const positionValue = (style.columnCount || 1) > 1 ? pointer.x : pointer.y;
                const targetCenter = (style.columnCount || 1) > 1
                    ? directProduct.rect.left + (directProduct.rect.width / 2)
                    : directProduct.rect.top + (directProduct.rect.height / 2);
                return {
                    category: directProduct.category,
                    placement: {
                        type: 'product',
                        productId: directProduct.id,
                        position: positionValue < targetCenter ? 'before' : 'after',
                    },
                    targetProductId: directProduct.id,
                    targetRect: directProduct.rect,
                };
            }

            const categoryTarget = Array.from(document.querySelectorAll<HTMLElement>(
                `[data-drag-scope="${scope}"][data-category-chunk]`
            ))
                .map((element) => ({
                    element,
                    category: element.dataset.categoryChunk || '',
                    rect: element.getBoundingClientRect(),
                }))
                .filter((target) => (
                    target.category &&
                    !target.category.startsWith(FREE_TEXT_PREFIX) &&
                    pointer.x >= target.rect.left &&
                    pointer.x <= target.rect.right &&
                    pointer.y >= target.rect.top &&
                    pointer.y <= target.rect.bottom
                ))
                .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height))[0];
            if (!categoryTarget) return null;

            const categoryProducts = Array.from(categoryTarget.element.querySelectorAll<HTMLElement>(
                `[data-drag-type="product"][data-drag-id][data-drag-group="${escapeSelectorValue(categoryTarget.category)}"]`
            ))
                .filter((element) => element.dataset.dragId !== productId)
                .map((element) => ({ id: element.dataset.dragId || '', rect: element.getBoundingClientRect() }))
                .filter((target) => Boolean(target.id))
                .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);

            if (categoryProducts.length === 0) {
                return {
                    category: categoryTarget.category,
                    placement: { type: 'edge', edge: pointer.y < categoryTarget.rect.top + (categoryTarget.rect.height / 2) ? 'start' : 'end' },
                    targetRect: categoryTarget.rect,
                };
            }

            const rowTargets = categoryProducts
                .filter((target) => pointer.y >= target.rect.top && pointer.y <= target.rect.bottom)
                .sort((left, right) => left.rect.left - right.rect.left);
            if (rowTargets.length > 0) {
                const target = rowTargets.find((candidate) => pointer.x < candidate.rect.left + (candidate.rect.width / 2));
                if (target) {
                    return {
                        category: categoryTarget.category,
                        placement: { type: 'product', productId: target.id, position: 'before' },
                        targetRect: target.rect,
                    };
                }
                const lastTarget = rowTargets[rowTargets.length - 1];
                return {
                    category: categoryTarget.category,
                    placement: { type: 'product', productId: lastTarget.id, position: 'after' },
                    targetRect: lastTarget.rect,
                };
            }

            const nextTarget = categoryProducts.find((target) => pointer.y < target.rect.top + (target.rect.height / 2));
            return nextTarget
                ? {
                    category: categoryTarget.category,
                    placement: { type: 'product', productId: nextTarget.id, position: 'before' },
                    targetRect: nextTarget.rect,
                }
                : {
                    category: categoryTarget.category,
                    placement: {
                        type: 'product',
                        productId: categoryProducts[categoryProducts.length - 1].id,
                        position: 'after',
                    },
                    targetRect: categoryProducts[categoryProducts.length - 1].rect,
                };
        },
        [dragScope, style.columnCount]
    );

    const getFreeTextSwapTargetForMovement = useCallback(({
        productId,
        sourceRect,
        projectedTop,
        direction,
    }: {
        productId: string;
        sourceRect: DOMRect;
        projectedTop: number;
        direction: 'up' | 'down';
    }) => {
        if (typeof document === 'undefined') return null;

        const scope = escapeSelectorValue(dragScope);
        const candidates = Array.from(document.querySelectorAll<HTMLElement>(
            `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group]`
        ))
            .filter((element) => element.dataset.dragId !== productId)
            .map((element) => {
                const id = element.dataset.dragId || '';
                const product = id ? getLatestProductById(id) : null;
                return {
                    product,
                    rect: element.getBoundingClientRect(),
                };
            })
            .filter((target): target is { product: Product; rect: DOMRect } => Boolean(
                target.product?.isFreeText
            ));
        const target = getNearestRenderedFreeTextTarget(sourceRect, candidates, direction);
        if (!target) return null;

        const gap = getVerticalGapBetweenRects(sourceRect, target.rect, direction);
        const intendedDistance = direction === 'down'
            ? projectedTop - sourceRect.top
            : sourceRect.top - projectedTop;
        return {
            product: target.product,
            rect: target.rect,
            gap,
            intendedDistance,
            shouldSwap: intendedDistance > Math.max(0, gap),
            contactTop: direction === 'down'
                ? sourceRect.top + gap
                : sourceRect.top - gap,
        };
    }, [dragScope, getLatestProductById]);

    const placeDraggedFreeTextInCategory = useCallback(
        (product: Product, targetCategory: string, placement: FreeTextCategoryPlacement) => {
            const sourceCategory = freeTextActiveCategoryRef.current[product.id] || product.category;
            const targetProducts = (groupedProductsRef.current[targetCategory] || []).filter((candidate) => candidate.id !== product.id);
            const targetIds = targetProducts.map((candidate) => candidate.id);
            let insertionIndex = placement.type === 'edge'
                ? (placement.edge === 'start' ? 0 : targetIds.length)
                : targetIds.indexOf(placement.productId);
            if (placement.type === 'product') {
                insertionIndex = insertionIndex === -1
                    ? targetIds.length
                    : insertionIndex + (placement.position === 'after' ? 1 : 0);
            }
            targetIds.splice(Math.max(0, Math.min(insertionIndex, targetIds.length)), 0, product.id);

            const currentTargetIds = (groupedProductsRef.current[targetCategory] || []).map((candidate) => candidate.id);
            const alreadyPlaced = sourceCategory === targetCategory &&
                (product.customMarginTop || 0) === 0 &&
                areOrdersEqual(currentTargetIds, targetIds);
            if (alreadyPlaced) return false;

            placeFreeTextInCategory({
                products,
                sortedCategories: sortedCategoriesRef.current,
                groupedProducts: groupedProductsRef.current,
                onUpdateProduct,
                onUpdateProducts,
                onStyleUpdate,
                style,
            }, { ...product, category: sourceCategory }, targetCategory, placement);

            const updatedProduct = { ...product, category: targetCategory, customMarginTop: 0 };
            const nextGrouped = { ...groupedProductsRef.current };
            Object.keys(nextGrouped).forEach((category) => {
                nextGrouped[category] = nextGrouped[category].filter((candidate) => candidate.id !== product.id);
            });
            const targetProductMap = new Map(targetProducts.map((candidate) => [candidate.id, candidate]));
            nextGrouped[targetCategory] = targetIds.map((id) => id === product.id ? updatedProduct : targetProductMap.get(id)!).filter(Boolean);
            if (sourceCategory.startsWith(FREE_TEXT_PREFIX) && sourceCategory !== targetCategory) {
                delete nextGrouped[sourceCategory];
                sortedCategoriesRef.current = sortedCategoriesRef.current.filter((category) => category !== sourceCategory);
                if (liveCategoryOrderRef.current) {
                    const nextCategoryOrder = liveCategoryOrderRef.current.filter((category) => category !== sourceCategory);
                    liveCategoryOrderRef.current = nextCategoryOrder;
                    setLiveCategoryOrder(nextCategoryOrder);
                }
                if (liveCategoryPageAssignmentsRef.current) {
                    const nextAssignments = { ...liveCategoryPageAssignmentsRef.current };
                    delete nextAssignments[sourceCategory];
                    liveCategoryPageAssignmentsRef.current = nextAssignments;
                    setLiveCategoryPageAssignments(nextAssignments);
                }
            }
            groupedProductsRef.current = nextGrouped;
            freeTextActiveCategoryRef.current[product.id] = targetCategory;
            setActiveProductGroup(product.id, targetCategory);

            const nextLiveProductOrder = { ...(liveProductOrderRef.current || {}) };
            Object.keys(nextLiveProductOrder).forEach((category) => {
                nextLiveProductOrder[category] = nextLiveProductOrder[category].filter((id) => id !== product.id);
            });
            nextLiveProductOrder[targetCategory] = targetIds;
            if (sourceCategory.startsWith(FREE_TEXT_PREFIX) && sourceCategory !== targetCategory) {
                delete nextLiveProductOrder[sourceCategory];
            }
            liveProductOrderRef.current = nextLiveProductOrder;
            setLiveProductOrder(nextLiveProductOrder);
            hasDragMutationRef.current = true;
            return true;
        },
        [onStyleUpdate, onUpdateProduct, onUpdateProducts, products, setActiveProductGroup, style]
    );

    const swapDraggedFreeTextWithTarget = useCallback((product: Product, targetProduct: Product) => {
        if (!targetProduct.isFreeText || product.id === targetProduct.id) {
            return { moved: false, shouldLock: false };
        }

        const sourceCategory = freeTextActiveCategoryRef.current[product.id] || product.category;
        const targetCategory = freeTextActiveCategoryRef.current[targetProduct.id] || targetProduct.category;
        const sourceSlot = freeTextDragSlotRef.current?.category === sourceCategory
            ? freeTextDragSlotRef.current
            : {
                category: sourceCategory,
                marginTop: Number.isFinite(Number(product.customMarginTop))
                    ? Number(product.customMarginTop)
                    : 0,
            };
        const sourceProduct = { ...product, category: sourceCategory, customMarginTop: sourceSlot.marginTop };
        const targetFreeText = { ...targetProduct, category: targetCategory };
        const contextProducts = products.map((candidate) => {
            if (candidate.id === product.id) return sourceProduct;
            if (candidate.id === targetProduct.id) return targetFreeText;
            return candidate;
        });
        if (!contextProducts.some((candidate) => candidate.id === product.id)) {
            contextProducts.push(sourceProduct);
        }
        if (!contextProducts.some((candidate) => candidate.id === targetProduct.id)) {
            contextProducts.push(targetFreeText);
        }

        const capturedUpdates: { id: string, field: keyof Product, value: any }[] = [];
        let nextStyleSnapshot: typeof style = {
            ...style,
            customCategoryOrder: liveCategoryOrderRef.current || style.customCategoryOrder,
            customProductOrder: liveProductOrderRef.current || style.customProductOrder,
        };
        const wrappedUpdateProducts = (updates: { id: string, field: keyof Product, value: any }[]) => {
            capturedUpdates.push(...updates);
            onUpdateProducts?.(updates);
        };
        const wrappedStyleUpdate: typeof onStyleUpdate = (value) => {
            nextStyleSnapshot = typeof value === 'function' ? value(nextStyleSnapshot) : value;
            onStyleUpdate?.(value);
        };

        swapFreeTextItems({
            products: contextProducts,
            sortedCategories: sortedCategoriesRef.current,
            groupedProducts: groupedProductsRef.current,
            onUpdateProducts: wrappedUpdateProducts,
            onStyleUpdate: wrappedStyleUpdate,
            style,
        }, sourceProduct, targetFreeText);

        if (capturedUpdates.length === 0) return { moved: false, shouldLock: false };

        freeTextDragSlotRef.current = {
            category: targetCategory,
            marginTop: Number.isFinite(Number(targetFreeText.customMarginTop))
                ? Number(targetFreeText.customMarginTop)
                : 0,
        };

        if (capturedUpdates.length > 0) {
            const patchesByProduct = new Map<string, Partial<Product>>();
            capturedUpdates.forEach((update) => {
                const existingPatch = patchesByProduct.get(update.id) || {};
                patchesByProduct.set(update.id, { ...existingPatch, [update.field]: update.value });
            });

            const nextGrouped: Record<string, Product[]> = {};
            Object.entries(groupedProductsRef.current).forEach(([category, categoryProducts]) => {
                if (!nextGrouped[category]) nextGrouped[category] = [];

                categoryProducts.forEach((candidate) => {
                    const patch = patchesByProduct.get(candidate.id);
                    const nextCategory = typeof patch?.category === 'string' ? patch.category : candidate.category;
                    const nextProduct = patch ? { ...candidate, ...patch, category: nextCategory } : candidate;

                    if (!nextGrouped[nextCategory]) nextGrouped[nextCategory] = [];
                    nextGrouped[nextCategory].push(nextProduct);
                });
            });

            if (nextStyleSnapshot.customProductOrder) {
                Object.entries(nextStyleSnapshot.customProductOrder).forEach(([category, orderedIds]) => {
                    const categoryProducts = nextGrouped[category];
                    if (!categoryProducts) return;

                    const productsById = new Map(categoryProducts.map((candidate) => [candidate.id, candidate]));
                    const orderedProducts = orderedIds
                        .map((id) => productsById.get(id))
                        .filter((candidate): candidate is Product => Boolean(candidate));
                    const remainingProducts = categoryProducts.filter((candidate) => !orderedIds.includes(candidate.id));
                    nextGrouped[category] = [...orderedProducts, ...remainingProducts];
                });
            }

            groupedProductsRef.current = nextGrouped;

            patchesByProduct.forEach((patch, productId) => {
                if (typeof patch.category === 'string') {
                    freeTextActiveCategoryRef.current[productId] = patch.category;
                    if (productId === product.id) setActiveProductGroup(productId, patch.category);
                }
            });
        }

        if (nextStyleSnapshot.customProductOrder) {
            liveProductOrderRef.current = nextStyleSnapshot.customProductOrder;
            setLiveProductOrder(nextStyleSnapshot.customProductOrder);
        }

        if (nextStyleSnapshot.customCategoryOrder) {
            sortedCategoriesRef.current = nextStyleSnapshot.customCategoryOrder;
            liveCategoryOrderRef.current = nextStyleSnapshot.customCategoryOrder;
            setLiveCategoryOrder(nextStyleSnapshot.customCategoryOrder);
        }

        const shouldLock = capturedUpdates.some((update) => update.field === 'category')
            || nextStyleSnapshot.customProductOrder !== style.customProductOrder;

        hasDragMutationRef.current = true;
        return { moved: true, shouldLock };
    }, [
        onStyleUpdate,
        onUpdateProducts,
        products,
        setActiveProductGroup,
        style,
    ]);

    const initializeFreeTextDragState = useCallback(
        (product: Product, group: string, pointer: { x: number; y: number }) => {
            const currentElement = getRenderedDragElement('product', product.id, group)
                || getRenderedDragElement('product', product.id)
                || document.getElementById(`product-container-${product.id}`);
            const currentRect = currentElement?.getBoundingClientRect();
            freeTextPointerOffsetYRef.current = currentRect ? pointer.y - currentRect.top : null;
            freeTextActiveCategoryRef.current[product.id] = group;
            const rawProductMargin = Number(product.customMarginTop);
            const productMargin = getSafeFreeTextMargin(rawProductMargin);
            freeTextDragSlotRef.current = {
                category: group,
                marginTop: productMargin,
            };
            initializeProductDragState(product.id, group, pointer);

            const categoryElement = group.startsWith(FREE_TEXT_PREFIX)
                ? null
                : getRenderedDragElement('category', group);
            const categoryRect = categoryElement?.getBoundingClientRect();
            const pageElement = currentElement?.closest<HTMLElement>('[data-drag-page-container="category"]');
            const pageRect = pageElement?.getBoundingClientRect();
            const scale = pageRect && pageRect.height > 0 ? pageRect.height / A4_HEIGHT_PX : 1;
            const rawInitialMargin = currentRect && categoryRect
                ? Math.max(0, Math.round((currentRect.top - categoryRect.top) / Math.max(scale, 0.001)))
                : product.customMarginTop || 0;
            const initialMargin = getSafeFreeTextMargin(rawInitialMargin);

            if (group.startsWith(FREE_TEXT_PREFIX)) {
                ensureFreeTextCategoryDragState(product, pointer, group, 'before', initialMargin);
            }
        },
        [ensureFreeTextCategoryDragState, getRenderedDragElement, initializeProductDragState]
    );

    const activateDrag = useCallback(
        (pending: PendingDrag, pointer: { x: number; y: number }) => {
            const draggedProduct = pending.type === 'product' ? products.find((product) => product.id === pending.id) : null;

            try {
                if (isDraggingRef.current) return;

                clearPendingActivation();
                applyBodyDragStyles();
                lockScrollableAncestors(pending.element);
                keepScrollLocked();
                if (pending.pointerType === 'touch') {
                    attachNativeTouchBlocker();
                }

                try {
                    pending.element.setPointerCapture(pending.pointerId);
                    pointerCaptureRef.current = { element: pending.element, pointerId: pending.pointerId };
                } catch {
                    // Some browsers may reject capture if the pointer was already cancelled.
                }

                const newItem = { type: pending.type, id: pending.id, group: pending.group };
                isDraggingRef.current = true;
                hasDragMutationRef.current = false;
                setDraggedItem(newItem);
                draggedItemRef.current = newItem;
                activePointerRef.current = { pointerId: pending.pointerId, pointerType: pending.pointerType };
                lastPointerRef.current = { x: pointer.x, y: pointer.y };
                dragStartPointerRef.current = { x: pointer.x, y: pointer.y };
                dragSourceContextRef.current = pending.element.dataset.dragContext || null;
                handleSelection(pending.type === 'product' && draggedProduct?.isFreeText ? 'freeText' : pending.type, pending.id);

                if (pending.type === 'category') {
                    initializeCategoryDragState(pending.id, pointer);
                } else {
                    const pendingProduct = draggedProduct;
                    if (pendingProduct?.isFreeText) {
                        const activeGroup = pending.group || pendingProduct.category || `${FREE_TEXT_PREFIX}${pendingProduct.id}`;
                        initializeFreeTextDragState(pendingProduct, activeGroup, pointer);
                    } else {
                        initializeProductDragState(pending.id, pending.group, pointer);
                    }
                }
            } catch (error) {
                if (draggedProduct?.isFreeText) {
                    reportFreeTextDragError('activate-drag', error, { pointer, productId: pending.id, group: pending.group });
                }
                cancelAndCleanup();
            }
        },
        [applyBodyDragStyles, attachNativeTouchBlocker, cancelAndCleanup, clearPendingActivation, handleSelection, initializeCategoryDragState, initializeFreeTextDragState, initializeProductDragState, keepScrollLocked, lockScrollableAncestors, products, reportFreeTextDragError]
    );

    const handlePointerReorder = useCallback(
        (pointer: { x: number; y: number }) => {
            try {
            const currentDragItem = draggedItemRef.current;
            const previousPointer = lastPointerRef.current;
            if (!currentDragItem || !previousPointer) {
                lastPointerRef.current = pointer;
                return;
            }

            const categorySwapRebase = categorySwapRebaseRef.current;
            if (currentDragItem.type === 'category' && categorySwapRebase?.sourceId === currentDragItem.id) {
                categorySwapRebase.pointer = pointer;
                lastPointerRef.current = pointer;
                return;
            }

            const swapRebase = freeTextSwapRebaseRef.current;
            if (swapRebase?.sourceId === currentDragItem.id) {
                swapRebase.pointer = pointer;
                lastPointerRef.current = pointer;
                return;
            }

            const deltaX = pointer.x - previousPointer.x;
            const deltaY = pointer.y - previousPointer.y;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
                return;
            }

            if (currentDragItem.type === 'product') {
                const draggedProduct = getLatestProductById(currentDragItem.id);

                if (draggedProduct?.isFreeText) {
                    const currentCategory = freeTextActiveCategoryRef.current[currentDragItem.id] || draggedProduct.category || `${FREE_TEXT_PREFIX}${currentDragItem.id}`;
                    const activeProduct = { ...draggedProduct, category: currentCategory };
                    const currentElement =
                        getRenderedDragElement('product', currentDragItem.id, currentCategory) ||
                        getRenderedDragElement('product', currentDragItem.id, currentDragItem.group) ||
                        getRenderedDragElement('product', currentDragItem.id) ||
                        document.getElementById(`product-container-${currentDragItem.id}`);
                    const currentRect = currentElement?.getBoundingClientRect();
                    const isGhostFreeText = currentCategory.startsWith(FREE_TEXT_PREFIX);
                    const categoryElement = isGhostFreeText
                        ? null
                        : getRenderedDragElement('category', currentCategory);
                    const categoryRect = categoryElement?.getBoundingClientRect();

                    if (!isGhostFreeText && categoryRect) {
                        if (pointer.y < categoryRect.top - 24) {
                            ensureFreeTextCategoryDragState(activeProduct, pointer, currentCategory, 'before', 0);
                            freeTextPointerOffsetYRef.current = currentRect ? pointer.y - currentRect.top : null;
                            lastPointerRef.current = pointer;
                            return;
                        }

                        if (pointer.y > categoryRect.bottom + 24) {
                            ensureFreeTextCategoryDragState(activeProduct, pointer, currentCategory, 'after', STANDARD_GAP);
                            freeTextPointerOffsetYRef.current = currentRect ? pointer.y - currentRect.top : null;
                            lastPointerRef.current = pointer;
                            return;
                        }
                    }

                    const swapPointerOffset = freeTextPointerOffsetYRef.current;
                    const projectedFreeTextTop = currentRect && swapPointerOffset !== null
                        ? pointer.y - swapPointerOffset
                        : currentRect?.top ?? pointer.y;
                    const swapDirection = deltaY > 0 ? 'down' : deltaY < 0 ? 'up' : null;
                    const swapLock = freeTextSwapLockRef.current;
                    if (swapLock) {
                        const lockedTargetProduct = getLatestProductById(swapLock.targetId);
                        const lockedTargetCategory = lockedTargetProduct
                            ? (freeTextActiveCategoryRef.current[swapLock.targetId] || lockedTargetProduct.category)
                            : undefined;
                        const lockedTargetElement = lockedTargetCategory
                            ? (
                                getRenderedDragElement('product', swapLock.targetId, lockedTargetCategory) ||
                                getRenderedDragElement('product', swapLock.targetId)
                            )
                            : null;
                        const lockedTargetRect = lockedTargetElement?.getBoundingClientRect();
                        const containersAreSeparated = Boolean(
                            currentRect &&
                            lockedTargetRect &&
                            (
                                currentRect.right < lockedTargetRect.left - 0.5 ||
                                currentRect.left > lockedTargetRect.right + 0.5 ||
                                currentRect.bottom < lockedTargetRect.top - 0.5 ||
                                currentRect.top > lockedTargetRect.bottom + 0.5
                            )
                        );

                        if (swapLock.sourceId !== currentDragItem.id || containersAreSeparated) {
                            freeTextSwapLockRef.current = null;
                        }
                    }

                    const categoryTarget = getFreeTextCategoryTargetAtPointer(pointer, currentDragItem.id, { includeFreeTextTargets: true });
                    const freeTextSwapTarget = currentRect && swapDirection
                        ? getFreeTextSwapTargetForMovement({
                            productId: currentDragItem.id,
                            sourceRect: currentRect,
                            projectedTop: projectedFreeTextTop,
                            direction: swapDirection,
                        })
                        : null;
                    const isOverFreeTextSwapTarget = Boolean(freeTextSwapTarget?.shouldSwap);
                    if (freeTextSwapTarget?.shouldSwap && swapDirection && currentRect) {
                        const targetProduct = freeTextSwapTarget.product;
                        const activeLock = freeTextSwapLockRef.current;
                        const isLockedOnTarget = Boolean(
                            activeLock &&
                            activeLock.sourceId === currentDragItem.id &&
                            activeLock.targetId === targetProduct.id
                        );

                        if (!isLockedOnTarget) {
                            const targetCategoryBeforeSwap =
                                freeTextActiveCategoryRef.current[targetProduct.id] || targetProduct.category;
                            const sourcePageElement = currentElement?.closest<HTMLElement>(
                                '[data-drag-page-container="category"][data-drag-page-index]'
                            );
                            const sourcePageRect = sourcePageElement?.getBoundingClientRect();
                            const sourceScale = sourcePageRect && sourcePageRect.height > 0
                                ? sourcePageRect.height / A4_HEIGHT_PX
                                : 1;
                            const rawSourceMargin = Number(activeProduct.customMarginTop);
                            const sourceMargin = getSafeFreeTextMargin(rawSourceMargin);
                            const sourceNaturalTop = currentRect.top - (sourceMargin * sourceScale);
                            const rawContactMargin =
                                (freeTextSwapTarget.contactTop - sourceNaturalTop) / Math.max(sourceScale, 0.001);
                            freeTextDragSlotRef.current = {
                                category: currentCategory,
                                marginTop: getSafeFreeTextMargin(rawContactMargin),
                            };

                            let collisionResult = { moved: false, shouldLock: false };
                            flushSync(() => {
                                collisionResult = swapDraggedFreeTextWithTarget(activeProduct, targetProduct);
                            });
                            if (collisionResult.moved) {
                                rebaseFreeTextAfterSwap({
                                    sourceId: currentDragItem.id,
                                    sourceCategory: targetCategoryBeforeSwap,
                                    pointer,
                                });
                                if (collisionResult.shouldLock) {
                                    freeTextSwapLockRef.current = {
                                        sourceId: currentDragItem.id,
                                        targetId: targetProduct.id,
                                    };
                                }
                                lastPointerRef.current = pointer;
                                return;
                            }
                        }
                    }

                    const categoryTargetInset = categoryTarget?.targetRect
                        ? Math.min(24, categoryTarget.targetRect.width * 0.15)
                        : 0;
                    const isStableCategoryTarget = Boolean(
                        categoryTarget &&
                        categoryTarget.targetRect &&
                        pointer.x >= categoryTarget.targetRect.left + categoryTargetInset &&
                        pointer.x <= categoryTarget.targetRect.right - categoryTargetInset &&
                        pointer.y >= categoryTarget.targetRect.top + 4 &&
                        pointer.y <= categoryTarget.targetRect.bottom - 4
                    );
                    if (
                        categoryTarget &&
                        isStableCategoryTarget &&
                        (categoryTarget.category !== currentCategory || categoryTarget.placement.type === 'product')
                    ) {
                        const targetProduct = categoryTarget.targetProductId
                            ? getLatestProductById(categoryTarget.targetProductId)
                            : null;
                        if (!targetProduct?.isFreeText && !categoryTarget.category.startsWith(FREE_TEXT_PREFIX)) {
                            const moved = placeDraggedFreeTextInCategory(activeProduct, categoryTarget.category, categoryTarget.placement);
                            if (moved) {
                                lastPointerRef.current = pointer;
                                return;
                            }
                        }
                    }

                    if (!isGhostFreeText) {
                        setActiveProductGroup(activeProduct.id, currentCategory);
                        reorderProductByPointer(pointer, { x: deltaX, y: deltaY });
                        lastPointerRef.current = pointer;
                        return;
                    }

                    const activeFreeTextCategory = ensureFreeTextCategoryDragState(
                        activeProduct,
                        pointer,
                        currentCategory,
                        'before',
                        0
                    );
                    const lanes = getCategoryLanes();
                    const pointerLane = lanes.find((lane) => (
                        pointer.x >= lane.rect.left &&
                        pointer.x <= lane.rect.right &&
                        pointer.y >= lane.rect.top &&
                        pointer.y <= lane.rect.bottom
                    )) || (lanes.length > 0
                        ? lanes.reduce((best, lane) => {
                            const bestCenterX = best.rect.left + (best.rect.width / 2);
                            const bestCenterY = best.rect.top + (best.rect.height / 2);
                            const laneCenterX = lane.rect.left + (lane.rect.width / 2);
                            const laneCenterY = lane.rect.top + (lane.rect.height / 2);
                            const bestDistance = Math.hypot(pointer.x - bestCenterX, pointer.y - bestCenterY);
                            const laneDistance = Math.hypot(pointer.x - laneCenterX, pointer.y - laneCenterY);
                            return laneDistance < bestDistance ? lane : best;
                        })
                        : undefined);

                    if (pointerLane && !isOverFreeTextSwapTarget) {
                        const currentAssignments = liveCategoryPageAssignmentsRef.current || {};
                        const currentPlacement = currentAssignments[activeFreeTextCategory];
                        if (
                            currentPlacement?.pageIndex !== pointerLane.pageIndex ||
                            currentPlacement?.columnIndex !== pointerLane.columnIndex
                        ) {
                            const nextAssignments = {
                                ...currentAssignments,
                                [activeFreeTextCategory]: {
                                    pageIndex: pointerLane.pageIndex,
                                    columnIndex: pointerLane.columnIndex,
                                },
                            };
                            liveCategoryPageAssignmentsRef.current = nextAssignments;
                            setLiveCategoryPageAssignments(nextAssignments);
                            categoryActivePageIndexRef.current = pointerLane.pageIndex;
                            categoryActiveLaneKeyRef.current = pointerLane.key;
                            hasDragMutationRef.current = true;
                        }
                    }

                    const refreshedProduct = getLatestProductById(currentDragItem.id) || activeProduct;
                    const refreshedElement =
                        getRenderedDragElement('product', currentDragItem.id, activeFreeTextCategory) ||
                        getRenderedDragElement('product', currentDragItem.id) ||
                        currentElement;
                    const refreshedRect = refreshedElement?.getBoundingClientRect();
                    const pointerOffset = freeTextPointerOffsetYRef.current ?? (
                        refreshedRect ? Math.max(0, Math.min(pointer.y - refreshedRect.top, refreshedRect.height)) : 0
                    );
                    freeTextPointerOffsetYRef.current = pointerOffset;
                    const rawCurrentMargin = Number(refreshedProduct.customMarginTop);
                    const currentMargin = getSafeFreeTextMargin(rawCurrentMargin);
                    const activePlacement = liveCategoryPageAssignmentsRef.current?.[activeFreeTextCategory];
                    const activeLaneKey = activePlacement
                        ? getCategoryLaneKey(String(activePlacement.pageIndex), String(activePlacement.columnIndex))
                        : categoryActiveLaneKeyRef.current;
                    const activeLane = pointerLane || lanes.find((lane) => lane.key === activeLaneKey);
                    if (activeLane && !isOverFreeTextSwapTarget) {
                        syncFreeTextCategoryOrderToLane(activeFreeTextCategory, pointer, activeLane.key);
                    }
                    const pageElement = activeLane
                        ? document.querySelector<HTMLElement>(
                            `[data-drag-scope="${escapeSelectorValue(dragScope)}"][data-drag-page-container="category"][data-drag-page-index="${activeLane.pageIndex}"]`
                        )
                        : refreshedElement?.closest<HTMLElement>('[data-drag-page-container="category"][data-drag-page-index]');
                    const pageRect = pageElement?.getBoundingClientRect();
                    const scale = pageRect && pageRect.height > 0 ? pageRect.height / A4_HEIGHT_PX : 1;
                    const safeTop = activeLane?.rect.top
                        ?? (pageRect ? pageRect.top + ((style.pagePadding || 48) * scale) : refreshedRect?.top ?? pointer.y);
                    const safeBottom = pageRect
                        ? pageRect.bottom - (((style.pagePadding || 48) + SAFETY_BUFFER) * scale)
                        : Number.POSITIVE_INFINITY;
                    const rawDesiredTop = refreshedRect
                        ? Math.max(
                            safeTop,
                            Math.min(pointer.y - pointerOffset, Math.max(safeTop, safeBottom - refreshedRect.height))
                        )
                        : pointer.y;
                    const edgeLimitedDesiredTop = freeTextSwapTarget && swapDirection
                        ? (
                            swapDirection === 'down'
                                ? Math.min(rawDesiredTop, freeTextSwapTarget.contactTop)
                                : Math.max(rawDesiredTop, freeTextSwapTarget.contactTop)
                        )
                        : rawDesiredTop;
                    const safeClientTop = refreshedRect && pageElement
                        ? getCollisionSafeFreeTextTop({
                            root: pageElement,
                            desiredTop: edgeLimitedDesiredTop,
                            height: refreshedRect.height,
                            pointerY: pointer.y,
                            excludeProductId: currentDragItem.id,
                            excludeProductIds: products
                                .filter((candidate) => candidate.isFreeText)
                                .map((candidate) => candidate.id),
                            minTop: safeTop,
                            maxBottom: safeBottom,
                            minLeft: activeLane?.rect.left,
                            maxRight: activeLane?.rect.right,
                        })
                        : edgeLimitedDesiredTop;
                    const resolvedDesiredTop = safeClientTop ?? refreshedRect?.top ?? edgeLimitedDesiredTop;
                    const desiredTop = freeTextSwapTarget && swapDirection
                        ? (
                            swapDirection === 'down'
                                ? Math.min(resolvedDesiredTop, freeTextSwapTarget.contactTop)
                                : Math.max(resolvedDesiredTop, freeTextSwapTarget.contactTop)
                        )
                        : resolvedDesiredTop;
                    const naturalTop = refreshedRect
                        ? refreshedRect.top - (currentMargin * scale)
                        : desiredTop - (currentMargin * scale);
                    const exactDesiredMargin = (desiredTop - naturalTop) / Math.max(scale, 0.001);
                    const roundedDesiredMargin = Math.round(exactDesiredMargin);
                    const exactContactMargin = freeTextSwapTarget
                        ? (freeTextSwapTarget.contactTop - naturalTop) / Math.max(scale, 0.001)
                        : null;
                    const rawDesiredMargin = exactContactMargin !== null && swapDirection
                        ? (
                            swapDirection === 'down'
                                ? Math.min(roundedDesiredMargin, exactContactMargin)
                                : Math.max(roundedDesiredMargin, exactContactMargin)
                        )
                        : roundedDesiredMargin;
                    const desiredMargin = getSafeFreeTextMargin(rawDesiredMargin);

                    if (desiredMargin !== currentMargin) {
                        freeTextDragSlotRef.current = {
                            category: activeFreeTextCategory,
                            marginTop: desiredMargin,
                        };
                        onUpdateProducts?.([{ id: activeProduct.id, field: 'customMarginTop', value: desiredMargin }]);
                        moveGroupedProductRef(refreshedProduct, activeFreeTextCategory, { customMarginTop: desiredMargin });
                        hasDragMutationRef.current = true;
                    }

                    lastPointerRef.current = pointer;
                    return;
                }
            }

            if (currentDragItem.type === 'category') {
                reorderCategoryByPointer(pointer, { commitImmediately: false });
            } else {
                const draggedProduct = getLatestProductById(currentDragItem.id);
                if (draggedProduct && !draggedProduct.isFreeText) {
                    const categoryTarget = getFreeTextCategoryTargetAtPointer(pointer, currentDragItem.id);
                    const currentElement = getRenderedDragElement('product', currentDragItem.id, currentDragItem.group) 
                        || getRenderedDragElement('product', currentDragItem.id)
                        || document.getElementById(`product-container-${currentDragItem.id}`);
                    
                    if (categoryTarget && categoryTarget.category !== currentDragItem.group) {
                        if (!props.productsCanChangeCategory) {
                            currentElement?.classList.add('invalid-drag-target');
                        } else {
                            currentElement?.classList.remove('invalid-drag-target');
                            // Move the product to the new category immediately
                            const oldGroup = currentDragItem.group;
                            const newGroup = categoryTarget.category;
                            
                            // Update dragged item group
                            currentDragItem.group = newGroup;
                            
                            // Update the product's category in state
                            props.onUpdateProduct?.(currentDragItem.id, 'category', newGroup);
                            
                            // Update liveProductOrderRef to move the ID
                            if (liveProductOrderRef.current && oldGroup && newGroup) {
                                const liveOrder = liveProductOrderRef.current;
                                const oldOrder = liveOrder[oldGroup] || [];
                                const newOrder = liveOrder[newGroup] || groupedProductsRef.current[newGroup]?.map((p: Product) => p.id) || [];
                                
                                liveProductOrderRef.current = {
                                    ...liveOrder,
                                    [oldGroup]: oldOrder.filter((id: string) => id !== currentDragItem.id),
                                    [newGroup]: [...newOrder, currentDragItem.id]
                                };
                            }
                            
                            hasDragMutationRef.current = true;
                        }
                    } else {
                        currentElement?.classList.remove('invalid-drag-target');
                    }
                }

                reorderProductByPointer(pointer, { x: deltaX, y: deltaY });
            }

            lastPointerRef.current = pointer;
            } catch (error) {
                reportFreeTextDragError('pointer-reorder', error, { pointer });
                cancelAndCleanup();
            }
        },
        [
            cancelAndCleanup,
            ensureFreeTextCategoryDragState,
            getCategoryLanes,
            getFreeTextCategoryTargetAtPointer,
            getFreeTextSwapTargetForMovement,
            getRenderedDragElement,
            getLatestProductById,
            moveGroupedProductRef,
            onUpdateProduct,
            onUpdateProducts,
            placeDraggedFreeTextInCategory,
            products,
            props.onUpdateProduct,
            props.productsCanChangeCategory,
            reportFreeTextDragError,
            reorderCategoryByPointer,
            reorderProductByPointer,
            rebaseFreeTextAfterSwap,
            setActiveProductGroup,
            swapDraggedFreeTextWithTarget,
            syncFreeTextCategoryOrderToLane,
            style,
        ]
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const activePointer = activePointerRef.current;
            if (activePointer) {
                if (event.pointerId !== activePointer.pointerId) return;
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                if (activePointer.pointerType === 'touch') {
                    clearTouchCancelCommit();
                    if (Date.now() - lastNativeTouchMoveAtRef.current < 80) {
                        keepScrollLocked();
                        return;
                    }
                }
                keepScrollLocked();
                handlePointerReorder({ x: event.clientX, y: event.clientY });
                return;
            }

            const pending = pendingDragRef.current;
            if (!pending || event.pointerId !== pending.pointerId) return;

            const traveledDistance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
            const activationThreshold = pending.pointerType === 'touch'
                ? TOUCH_MOVE_CANCEL_THRESHOLD_PX
                : POINTER_MOVE_THRESHOLD_PX;
            if (traveledDistance < activationThreshold) return;

            activateDrag(pending, { x: pending.startX, y: pending.startY });
            handlePointerReorder({ x: event.clientX, y: event.clientY });
        },
        [activateDrag, clearTouchCancelCommit, handlePointerReorder, keepScrollLocked]
    );

    const updateCategoryAtReleasePointer = useCallback((pointer: { x: number; y: number }) => {
        if (draggedItemRef.current?.type !== 'category') return;

        const pendingRebase = categorySwapRebaseRef.current;
        if (pendingRebase?.sourceId === draggedItemRef.current.id) {
            pendingRebase.pointer = pointer;
            lastPointerRef.current = pointer;
            return;
        }

        reorderCategoryByPointer(pointer, { commitImmediately: false });
        lastPointerRef.current = pointer;
    }, [reorderCategoryByPointer]);

    const handleGlobalPointerUp = useCallback(
        (event: PointerEvent) => {
            const activePointer = activePointerRef.current;
            if (activePointer && event.pointerId === activePointer.pointerId) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                updateCategoryAtReleasePointer({ x: event.clientX, y: event.clientY });
                performCommitAndCleanup();
                return;
            }

            const pending = pendingDragRef.current;
            if (pending && event.pointerId === pending.pointerId) {
                cancelAndCleanup();
            }
        },
        [cancelAndCleanup, performCommitAndCleanup, updateCategoryAtReleasePointer]
    );

    const handleGlobalPointerCancel = useCallback(
        (event: PointerEvent) => {
            const activePointer = activePointerRef.current;
            if (activePointer && event.pointerId === activePointer.pointerId) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();

                if (activePointer.pointerType === 'touch' && isDraggingRef.current) {
                    keepScrollLocked();
                    scheduleTouchCancelCommit();
                    return;
                }

                updateCategoryAtReleasePointer({ x: event.clientX, y: event.clientY });
                performCommitAndCleanup();
                return;
            }

            const pending = pendingDragRef.current;
            if (pending && event.pointerId === pending.pointerId) {
                cancelAndCleanup();
            }
        },
        [cancelAndCleanup, keepScrollLocked, performCommitAndCleanup, scheduleTouchCancelCommit, updateCategoryAtReleasePointer]
    );

    const handleWindowBlur = useCallback(() => {
        if (isDraggingRef.current) {
            performCommitAndCleanup();
            return;
        }
        if (pendingDragRef.current) {
            cancelAndCleanup();
        }
    }, [cancelAndCleanup, performCommitAndCleanup]);

    useEffect(() => {
        pointerMoveHandlerRef.current = handleGlobalPointerMove;
    }, [handleGlobalPointerMove]);

    useEffect(() => {
        pointerUpHandlerRef.current = handleGlobalPointerUp;
    }, [handleGlobalPointerUp]);

    useEffect(() => {
        pointerCancelHandlerRef.current = handleGlobalPointerCancel;
    }, [handleGlobalPointerCancel]);

    useEffect(() => {
        touchMoveHandlerRef.current = (event: TouchEvent) => {
            const pending = pendingDragRef.current;
            if (!isDraggingRef.current && pending?.pointerType !== 'touch') return;

            if (event.touches.length >= 2) {
                cancelAndCleanup();
                return;
            }

            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();
            event.stopImmediatePropagation();
            clearTouchCancelCommit();
            keepScrollLocked();
            lastNativeTouchMoveAtRef.current = Date.now();

            const touch = event.touches[0] || event.changedTouches[0];
            if (!touch) return;
            const pointer = { x: touch.clientX, y: touch.clientY };

            if (!isDraggingRef.current) {
                if (!pending || pending.pointerType !== 'touch') return;

                const traveledDistance = Math.hypot(pointer.x - pending.startX, pointer.y - pending.startY);
                if (traveledDistance < TOUCH_MOVE_CANCEL_THRESHOLD_PX) return;

                activateDrag(pending, { x: pending.startX, y: pending.startY });
            }

            if (isDraggingRef.current && draggedItemRef.current) {
                handlePointerReorder(pointer);
            }
        };
    }, [activateDrag, clearTouchCancelCommit, handlePointerReorder, keepScrollLocked]);

    useEffect(() => {
        touchEndHandlerRef.current = (event: TouchEvent) => {
            if (isDraggingRef.current && draggedItemRef.current) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                event.stopImmediatePropagation();
                clearTouchCancelCommit();
                const touch = event.changedTouches[0];
                if (touch) updateCategoryAtReleasePointer({ x: touch.clientX, y: touch.clientY });
                performCommitAndCleanup();
                return;
            }

            if (pendingDragRef.current?.pointerType === 'touch') {
                cancelAndCleanup();
                return;
            }

            removeNativeTouchBlockerRef.current();
        };
    }, [cancelAndCleanup, clearTouchCancelCommit, performCommitAndCleanup, updateCategoryAtReleasePointer]);

    useEffect(() => {
        touchCancelHandlerRef.current = (event: TouchEvent) => {
            if (isDraggingRef.current && draggedItemRef.current) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                event.stopImmediatePropagation();
                keepScrollLocked();
                if (event.touches.length === 0) {
                    clearTouchCancelCommit();
                    const touch = event.changedTouches[0];
                    if (touch) updateCategoryAtReleasePointer({ x: touch.clientX, y: touch.clientY });
                    performCommitAndCleanup();
                    return;
                }
                scheduleTouchCancelCommit();
                return;
            }

            if (pendingDragRef.current?.pointerType === 'touch') {
                cancelAndCleanup();
                return;
            }

            removeNativeTouchBlockerRef.current();
        };
    }, [cancelAndCleanup, clearTouchCancelCommit, keepScrollLocked, performCommitAndCleanup, scheduleTouchCancelCommit, updateCategoryAtReleasePointer]);

    useEffect(() => {
        blurHandlerRef.current = handleWindowBlur;
    }, [handleWindowBlur]);

    const stablePointerMoveListener = useCallback((event: PointerEvent) => {
        pointerMoveHandlerRef.current(event);
    }, []);

    const stablePointerUpListener = useCallback((event: PointerEvent) => {
        pointerUpHandlerRef.current(event);
    }, []);

    const stablePointerCancelListener = useCallback((event: PointerEvent) => {
        pointerCancelHandlerRef.current(event);
    }, []);

    const stableBlurListener = useCallback(() => {
        blurHandlerRef.current();
    }, []);

    const removeGlobalListeners = useCallback(() => {
        if (!listenersAttachedRef.current) return;
        window.removeEventListener('pointermove', stablePointerMoveListener, true);
        window.removeEventListener('pointerup', stablePointerUpListener, true);
        window.removeEventListener('pointercancel', stablePointerCancelListener, true);
        document.removeEventListener('pointermove', stablePointerMoveListener, true);
        document.removeEventListener('pointerup', stablePointerUpListener, true);
        document.removeEventListener('pointercancel', stablePointerCancelListener, true);
        window.removeEventListener('blur', stableBlurListener);
        listenersAttachedRef.current = false;
    }, [stableBlurListener, stablePointerCancelListener, stablePointerMoveListener, stablePointerUpListener]);

    useEffect(() => {
        removeGlobalListenersRef.current = removeGlobalListeners;
    }, [removeGlobalListeners]);

    const attachGlobalListeners = useCallback(() => {
        if (listenersAttachedRef.current) return;
        window.addEventListener('pointermove', stablePointerMoveListener, DRAG_EVENT_OPTIONS);
        window.addEventListener('pointerup', stablePointerUpListener, DRAG_EVENT_OPTIONS);
        window.addEventListener('pointercancel', stablePointerCancelListener, DRAG_EVENT_OPTIONS);
        document.addEventListener('pointermove', stablePointerMoveListener, DRAG_EVENT_OPTIONS);
        document.addEventListener('pointerup', stablePointerUpListener, DRAG_EVENT_OPTIONS);
        document.addEventListener('pointercancel', stablePointerCancelListener, DRAG_EVENT_OPTIONS);
        window.addEventListener('blur', stableBlurListener);
        listenersAttachedRef.current = true;
    }, [stableBlurListener, stablePointerCancelListener, stablePointerMoveListener, stablePointerUpListener]);

    useEffect(() => cancelAndCleanup, [cancelAndCleanup]);

    const sortedCategories = useMemo(() => {
        const draggedProduct = draggedItem?.type === 'product'
            ? products.find((product) => product.id === draggedItem.id)
            : null;

        if (liveCategoryOrder && (draggedItem?.type === 'category' || draggedProduct?.isFreeText)) {
            return liveCategoryOrder;
        }
        return sortedCategoriesBase;
    }, [draggedItem, liveCategoryOrder, products, sortedCategoriesBase]);

    const groupedProducts = useMemo(() => {
        if (!draggedItem || draggedItem.type !== 'product' || !liveProductOrder) {
            return groupedProductsBase;
        }

        const productById = new Map<string, Product>();
        Object.values(groupedProductsBase).forEach((groupProducts) => {
            groupProducts.forEach((product) => {
                productById.set(product.id, product);
            });
        });

        const liveAssignedCategoryById = new Map<string, string>();
        Object.entries(liveProductOrder).forEach(([category, order]) => {
            order.forEach((id) => {
                liveAssignedCategoryById.set(id, category);
            });
        });

        const nextGroups = { ...groupedProductsBase };
        Object.keys(liveProductOrder).forEach((category) => {
            const order = liveProductOrder[category];
            const originalProducts = groupedProductsBase[category] || [];
            const reorderedProducts: Product[] = [];

            order.forEach((id) => {
                const product = originalProducts.find((candidate) => candidate.id === id) || productById.get(id);
                if (product) {
                    reorderedProducts.push(product.category === category ? product : { ...product, category });
                }
            });

            originalProducts.forEach((product) => {
                const liveAssignedCategory = liveAssignedCategoryById.get(product.id);
                if (!order.includes(product.id) && (!liveAssignedCategory || liveAssignedCategory === category)) {
                    reorderedProducts.push(product);
                }
            });

            nextGroups[category] = reorderedProducts;
        });

        return nextGroups;
    }, [draggedItem, groupedProductsBase, liveProductOrder]);

    const handleDragStart = useCallback(
        (event: React.PointerEvent, type: DragType, id: string, group?: string) => {
            if (editingId || multiSelectMode || isInteractiveTarget(event.target)) return;
            if (event.shiftKey || event.ctrlKey || event.metaKey) return;
            if (event.button !== 0) return;

            event.stopPropagation();

            const pointerType = event.pointerType || 'mouse';
            const dragContext = (event.currentTarget as HTMLElement).dataset.dragContext || null;
            if (pointerType === 'touch' && !dragContext && event.cancelable) {
                event.preventDefault();
            }

            const draggedProduct = type === 'product' ? products.find((product) => product.id === id) : null;

            clearPendingActivation();
            attachGlobalListeners();
            if (pointerType === 'touch') {
                attachNativeTouchBlocker();
            }

            const pending: PendingDrag = {
                type,
                id,
                group,
                element: event.currentTarget as HTMLElement,
                pointerId: event.pointerId,
                pointerType,
                startX: event.clientX,
                startY: event.clientY,
                activationTimeoutId: null,
            };

            if (pending.pointerType === 'touch') {
                pending.activationTimeoutId = window.setTimeout(() => {
                    if (!pendingDragRef.current || pendingDragRef.current.pointerId !== pending.pointerId) return;
                    activateDrag(pending, { x: pending.startX, y: pending.startY });
                }, TOUCH_LONG_PRESS_MS);
            }

            pendingDragRef.current = pending;

            if (pointerType !== 'touch') {
                handleSelection(type === 'product' && draggedProduct?.isFreeText ? 'freeText' : type, id);
            }
        },
        [activateDrag, attachGlobalListeners, attachNativeTouchBlocker, clearPendingActivation, editingId, handleSelection, multiSelectMode, products]
    );

    const handleNativeDragStart = useCallback(
        (event: React.DragEvent<HTMLElement>, type: DragType, id: string, group?: string) => {
            const draggedProduct = type === 'product' ? products.find((product) => product.id === id) : null;

            try {
            if (editingId || multiSelectMode || isInteractiveTarget(event.target)) {
                event.preventDefault();
                return;
            }
            if (event.shiftKey || event.ctrlKey || event.metaKey) return;

            event.stopPropagation();
            clearPendingActivation();
            removeGlobalListenersRef.current();
            releasePointerCapture();
            attachNativeTouchBlocker();
            applyBodyDragStyles();
            lockScrollableAncestors(event.currentTarget as HTMLElement);
            keepScrollLocked();

            const pointer = getNativeDragPointer(event);
            const newItem = { type, id, group };

            handleSelection(type === 'product' && draggedProduct?.isFreeText ? 'freeText' : type, id);
            isDraggingRef.current = true;
            hasDragMutationRef.current = false;
            setDraggedItem(newItem);
            draggedItemRef.current = newItem;
            activePointerRef.current = null;
            lastPointerRef.current = pointer;
            dragStartPointerRef.current = pointer;
            dragSourceContextRef.current = event.currentTarget.dataset.dragContext || null;

            if (type === 'category') {
                initializeCategoryDragState(id, pointer);
            } else if (draggedProduct?.isFreeText) {
                const activeGroup = group || draggedProduct.category || `${FREE_TEXT_PREFIX}${draggedProduct.id}`;
                initializeFreeTextDragState(draggedProduct, activeGroup, pointer);
            } else {
                initializeProductDragState(id, group, pointer);
            }

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);

            const img = new Image();
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            event.dataTransfer.setDragImage(img, 0, 0);
            } catch (error) {
                if (draggedProduct?.isFreeText) {
                    reportFreeTextDragError('native-drag-start', error, { productId: id, group });
                }
                cancelAndCleanup();
            }
        },
        [
            applyBodyDragStyles,
            attachNativeTouchBlocker,
            cancelAndCleanup,
            clearPendingActivation,
            editingId,
            handleSelection,
            initializeCategoryDragState,
            initializeFreeTextDragState,
            initializeProductDragState,
            keepScrollLocked,
            lockScrollableAncestors,
            multiSelectMode,
            products,
            releasePointerCapture,
            reportFreeTextDragError,
        ]
    );

    const handleNativeDragOverItem = useCallback(
        (event: React.DragEvent<HTMLElement>) => {
            if (!draggedItemRef.current) return;

            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            try {
                handlePointerReorder(getNativeDragPointer(event));
            } catch (error) {
                reportFreeTextDragError('native-drag-over', error, {});
                cancelAndCleanup();
            }
        },
        [cancelAndCleanup, handlePointerReorder, reportFreeTextDragError]
    );

    const handleNativeDragEnd = useCallback(
        (event: React.DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.clientX !== 0 || event.clientY !== 0) {
                updateCategoryAtReleasePointer({ x: event.clientX, y: event.clientY });
            }
            performCommitAndCleanup();
        },
        [performCommitAndCleanup, updateCategoryAtReleasePointer]
    );

    return {
        dragScope,
        draggedItem,
        liveCategoryOrder,
        liveCategoryPageAssignments,
        liveCategoryPositions,
        liveProductOrder,
        sortedCategories,
        groupedProducts,
        handleDragStart,
        handleDragEnd: performCommitAndCleanup,
        handleNativeDragStart,
        handleNativeDragEnd,
        handleDragOverItem: handleNativeDragOverItem,
    };
};
