import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { CategoryPosition, Product } from '../../../domain/menu/model';
import { InteractionProps, SelectionItem, TOUCH_LONG_PRESS_MS } from './types';
import { isDraggableSelectionItem, keepSelectedOrder, moveSelectedProducts, preventCanvasDragClick } from './canvasSelectionDrag';
import { captureImageDrag, getRenderedImageDragPages, IMAGE_DRAG_THRESHOLD_PX, moveDraggedLayers, type CanvasLayerPositions, type ImageDragMotion, type LayerDragMove } from './imageDragMotion';
import { CATEGORY_CHUNK_GAP_PX, FREE_TEXT_PREFIX, STANDARD_GAP } from '../../../domain/menu/flow';
import { getPaginationBottomInset, type CategoryPlacementAssignment } from '../../../domain/menu/menuPagination';
import {
    getCollisionSafeFreeTextTop,
    getNearestRenderedFreeTextTarget,
    getVerticalGapBetweenRects,
    moveFreeTextToGhostSlot,
    placeFreeTextInCategory,
    swapFreeTextItems,
    type FreeTextCategoryPlacement,
} from './freeTextMovement';
import { resolveMenuMargins } from '../../../domain/menu/styleRules';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';

type DragType = 'category' | 'product' | 'addedImage';
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

interface DragMotion {
    lastPointer: { x: number; y: number } | null;
    dragStartPointer: { x: number; y: number } | null;
    productInsertionIndex: number | null;
    productDragStartRect: DOMRect | null;
    productInitialIndexById: Map<string, number>;
    productInitialTargetById: Map<string, { rect: DOMRect; laneKey: string }>;
    freeTextPointerOffsetY: number | null;
    freeTextPointerOffsetX: number | null;
    freeTextDragSlot: FreeTextDragSlot | null;
    freeTextSwapLock: {
        sourceId: string;
        targetId: string;
    } | null;
    freeTextSwapRebase: FreeTextSwapRebase | null;
    freeTextSwapRebaseFrame: number | null;
    categoryActivePageIndex: number | null;
    categoryActiveLaneKey: string | null;
    categoryPageSwitchOriginX: number | null;
    categoryPointerOffsetY: number | null;
    categoryDraggedHeight: number | null;
    categorySwapLock: CategorySwapLock | null;
    categoryFreeTextSwap: { id: string; rect: DOMRect; x: number; y: number; direction: number } | null;
    vacatedCategoryPosition: CategoryPosition | null;
    vacatedFreeTextPosition: CategoryPosition | null;
    freeTextInsertion: DOMRect | null;
    categorySwapRebase: CategorySwapRebase | null;
    categorySwapRebaseFrame: number | null;
}

const createDragMotion = (): DragMotion => ({
    lastPointer: null,
    dragStartPointer: null,
    productInsertionIndex: null,
    productDragStartRect: null,
    productInitialIndexById: new Map(),
    productInitialTargetById: new Map(),
    freeTextPointerOffsetY: null,
    freeTextPointerOffsetX: null,
    freeTextDragSlot: null,
    freeTextSwapLock: null,
    freeTextSwapRebase: null,
    freeTextSwapRebaseFrame: null,
    categoryActivePageIndex: null,
    categoryActiveLaneKey: null,
    categoryPageSwitchOriginX: null,
    categoryPointerOffsetY: null,
    categoryDraggedHeight: null,
    categorySwapLock: null,
    categoryFreeTextSwap: null,
    vacatedCategoryPosition: null,
    vacatedFreeTextPosition: null,
    freeTextInsertion: null,
    categorySwapRebase: null,
    categorySwapRebaseFrame: null,
});

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
    longPressReady?: boolean;
    scrolling?: boolean;
    freeText?: boolean;
    canvasSelection?: {
        canvas: HTMLElement;
        source: SelectionItem;
        items: ReturnType<typeof getDraggableSelection>;
        clear: boolean;
    };
    lastX?: number;
    lastY?: number;
}

const getDraggableSelection = (items: SelectionItem[]) => items.filter(isDraggableSelectionItem);

interface SelectionDragMember {
    item: NonNullable<DragItem>;
    start: PointerPosition;
    motion: DragMotion;
    layer?: ImageDragMotion;
}

interface SelectionDragSession {
    canvas: HTMLElement;
    start: PointerPosition;
    pointer: PointerPosition;
    members: SelectionDragMember[];
    productIds: Set<string>;
    freeTextIds: Set<string>;
    categoryIds: Set<string>;
    layers?: CanvasLayerPositions;
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

type PointerPosition = { x: number; y: number };

function crossesTarget(previous: PointerPosition, pointer: PointerPosition, bounds: DOMRect, horizontalBounds = bounds) {
    if (pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom) return true;
    const middle = bounds.top + bounds.height / 2;
    const delta = pointer.y - previous.y;
    if (!delta) return false;
    const progress = (middle - previous.y) / delta;
    if (progress < 0 || progress > 1) return false;
    const xAtCrossing = previous.x + (pointer.x - previous.x) * progress;
    return xAtCrossing >= horizontalBounds.left && xAtCrossing <= horizontalBounds.right;
}

function getCanvasSlot(element: HTMLElement, rect = element.getBoundingClientRect()) {
    const page = element.closest<HTMLElement>('[data-drag-page-container="category"]');
    const lane = element.closest<HTMLElement>('[data-drag-column-container="category"]');
    if (!page || !lane) return null;
    const pageRect = page.getBoundingClientRect();
    const scale = pageRect.width / Math.max(1, page.offsetWidth);
    return {
        page,
        pageRect,
        scale,
        position: {
            pageIndex: Number(page.dataset.dragPageIndex || 0),
            columnIndex: Number(lane.dataset.dragColumnIndex || 0),
            y: (rect.top - pageRect.top) / scale,
            pageX: (rect.left - pageRect.left) / scale,
        },
    };
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
const TWO_COLUMN_CATEGORY_TOUCH_MOVE_CANCEL_THRESHOLD_PX = 18;
const CATEGORY_COLUMN_SWITCH_INSET_PX = 32;
const CATEGORY_PAGE_SWITCH_INSET_PX = 72;
const CATEGORY_PAGE_SWITCH_THRESHOLD_PX = 96;
const PRODUCT_DESIGNER_CATEGORY_REORDER_MIN_DISTANCE_PX = 12;
const PRODUCT_DESIGNER_CATEGORY_REORDER_EDGE_RATIO = 0.2;
const PRODUCT_DESIGNER_AUTO_SCROLL_EDGE_PX = 72;
const PRODUCT_DESIGNER_AUTO_SCROLL_MAX_SPEED_PX = 18;
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

const getSafeFreeTextMargin = (value: unknown, pageHeightPx: number) => {
    const margin = Number(value);
    return Number.isFinite(margin)
        ? Math.max(0, Math.min(pageHeightPx, Math.round(margin)))
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

const moveItemToInsertionIndex = (order: string[], itemId: string, insertionIndex: number, isSelected?: (id: string) => boolean) => {
    const nextOrder = order.filter((id) => id !== itemId);
    const destination = isSelected ? keepSelectedOrder(order, itemId, insertionIndex, isSelected) : insertionIndex;
    const boundedIndex = Math.max(0, Math.min(destination, nextOrder.length));
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
    multiSelectMode: boolean = false,
    selectedItems: SelectionItem[] = [],
    collapseSelection?: (type: 'product' | 'category' | 'freeText' | 'addedImage', id: string) => void,
) => {
    const { products, style, onCommitCategoryOrder, onCommitProductOrder, onStyleUpdate, onUpdateProduct, onUpdateProducts } = props;
    const { heightPx: pageHeightPx } = resolveMenuPageDimensions(style);

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
    const [liveCanvasLayers, setLiveCanvasLayers] = useState<CanvasLayerPositions | null>(null);

    const draggedItemRef = useRef<DragItem>(null);
    const motionRef = useRef(createDragMotion());
    const selectionDragRef = useRef<SelectionDragSession | null>(null);
    const [draggedSelection, setDraggedSelection] = useState<SelectionItem[]>([]);
    const activeSelectionCanvasRef = useRef<HTMLElement | null>(null);
    const activePointerRef = useRef<{ pointerId: number; pointerType: string; freeText: boolean } | null>(null);
    const pointerCaptureRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
    const pendingDragRef = useRef<PendingDrag | null>(null);
    const liveCategoryOrderRef = useRef<string[] | null>(null);
    const liveCategoryPageAssignmentsRef = useRef<Record<string, CategoryPlacementAssignment> | null>(null);
    const liveCategoryPositionsRef = useRef<Record<string, CategoryPosition> | null>(null);
    const liveProductOrderRef = useRef<Record<string, string[]> | null>(null);
    const dragSourceContextRef = useRef<string | null>(null);
    const touchCancelCommitTimeoutRef = useRef<number | null>(null);
    const freeTextActiveCategoryRef = useRef<Record<string, string>>({});
    const isSelectedProductTarget = useCallback((id: string) => {
        const selection = selectionDragRef.current;
        return Boolean(selection && (selection.productIds.has(id) || selection.freeTextIds.has(id)));
    }, []);
    const isSelectedCategoryTarget = useCallback((id: string) => {
        const selection = selectionDragRef.current;
        return Boolean(selection && (selection.categoryIds.has(id) || (id.startsWith(FREE_TEXT_PREFIX)
            && selection.members.some(member => selection.freeTextIds.has(member.item.id)
                && (freeTextActiveCategoryRef.current[member.item.id] || member.item.group) === id))));
    }, []);
    const lastNativeTouchMoveAtRef = useRef(0);
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
    const reorderAtPointerRef = useRef<(pointer: { x: number; y: number }) => void>(() => { });
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
        overflowY: string;
        overscrollBehavior: string;
        htmlOverflow: string;
        htmlOverflowY: string;
        htmlOverscrollBehavior: string;
        htmlTouchAction: string;
        scrollX: number;
        scrollY: number;
    } | null>(null);
    const scrollContainerStyleRef = useRef<ScrollContainerSnapshot[]>([]);
    const productDesignerScrollContainerRef = useRef<HTMLElement | null>(null);
    const productDesignerAutoScrollPointerRef = useRef<{ x: number; y: number } | null>(null);
    const productDesignerAutoScrollFrameRef = useRef<number | null>(null);

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
            const capture = pointerCaptureRef.current;
            if (draggedItemRef.current?.type === 'category' && capture?.element.hasPointerCapture(capture.pointerId)) return;
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
        document.body.style.overflow = bodyStyleRef.current.overflow;
        document.body.style.overflowY = bodyStyleRef.current.overflowY;
        document.body.style.overscrollBehavior = bodyStyleRef.current.overscrollBehavior;
        root.style.overflow = bodyStyleRef.current.htmlOverflow;
        root.style.overflowY = bodyStyleRef.current.htmlOverflowY;
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
            overflowY: document.body.style.overflowY,
            overscrollBehavior: document.body.style.overscrollBehavior,
            htmlOverflow: root.style.overflow,
            htmlOverflowY: root.style.overflowY,
            htmlOverscrollBehavior: root.style.overscrollBehavior,
            htmlTouchAction: root.style.touchAction,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
        };
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.cursor = 'grabbing';
        document.body.style.touchAction = 'none';
        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';
        root.style.overflow = 'hidden';
        root.style.overscrollBehavior = 'none';
        root.style.touchAction = 'none';
    }, []);

    const scheduleProductDesignerAutoScroll = useCallback((pointer: { x: number; y: number }) => {
        productDesignerAutoScrollPointerRef.current = pointer;
        if (
            dragSourceContextRef.current !== 'product-designer'
            || productDesignerAutoScrollFrameRef.current !== null
            || typeof window === 'undefined'
        ) return;

        const step = () => {
            const container = productDesignerScrollContainerRef.current;
            const currentPointer = productDesignerAutoScrollPointerRef.current;
            if (!isDraggingRef.current || !container || !currentPointer) {
                productDesignerAutoScrollFrameRef.current = null;
                return;
            }

            const rect = container.getBoundingClientRect();
            const edgeSize = Math.min(PRODUCT_DESIGNER_AUTO_SCROLL_EDGE_PX, rect.height * 0.25);
            let direction = 0;
            let intensity = 0;

            if (currentPointer.y < rect.top + edgeSize) {
                direction = -1;
                intensity = Math.min(1, (rect.top + edgeSize - currentPointer.y) / Math.max(1, edgeSize));
            } else if (currentPointer.y > rect.bottom - edgeSize) {
                direction = 1;
                intensity = Math.min(1, (currentPointer.y - (rect.bottom - edgeSize)) / Math.max(1, edgeSize));
            }

            if (direction === 0 || intensity === 0) {
                productDesignerAutoScrollFrameRef.current = null;
                return;
            }

            const previousScrollTop = container.scrollTop;
            container.scrollTop += direction * Math.max(2, Math.ceil(PRODUCT_DESIGNER_AUTO_SCROLL_MAX_SPEED_PX * intensity));
            const appliedDelta = container.scrollTop - previousScrollTop;
            if (Math.abs(appliedDelta) < 0.5) {
                productDesignerAutoScrollFrameRef.current = null;
                return;
            }

            motionRef.current.lastPointer = { x: currentPointer.x, y: currentPointer.y - appliedDelta };
            productDesignerAutoScrollFrameRef.current = window.requestAnimationFrame(step);
            reorderAtPointerRef.current(currentPointer);
        };

        productDesignerAutoScrollFrameRef.current = window.requestAnimationFrame(step);
    }, []);

    const lockScrollableAncestors = useCallback((sourceElement: HTMLElement) => {
        if (typeof window === 'undefined' || scrollContainerStyleRef.current.length > 0) return;

        const containers: HTMLElement[] = [];
        const productDesignerScrollContainer = sourceElement.closest<HTMLElement>('[data-product-designer-scroll-container="true"]');
        let current = sourceElement.parentElement;

        while (current && current !== document.body && current !== document.documentElement) {
            const computed = window.getComputedStyle(current);
            // Only lock real scroll containers. Elements with visible overflow can have
            // larger scroll dimensions because controls protrude from them; changing only
            // one overflow axis on those elements turns them into nested scroll areas.
            const canScroll = /(auto|scroll|overlay)/.test(`${computed.overflowX} ${computed.overflowY}`);

            if (canScroll && current !== productDesignerScrollContainer) containers.push(current);
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
            element.style.overflow = 'hidden';
            element.style.overflowX = 'hidden';
            element.style.overflowY = 'hidden';
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
            snapshot.element.style.overflow = snapshot.overflow;
            snapshot.element.style.overflowX = snapshot.overflowX;
            snapshot.element.style.overflowY = snapshot.overflowY;
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

    const stableScrollBlocker = useCallback(() => {
        if (!isDraggingRef.current) return;
        keepScrollLocked();
    }, [keepScrollLocked]);

    const stableWheelBlocker = useCallback((event: WheelEvent) => {
        if (!isDraggingRef.current) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        keepScrollLocked();
    }, [keepScrollLocked]);

    const removeNativeTouchBlocker = useCallback(() => {
        if (!nativeTouchBlockerAttachedRef.current || typeof window === 'undefined') return;
        window.removeEventListener('touchmove', stableTouchMoveBlocker, true);
        window.removeEventListener('touchend', stableTouchEndBlocker, true);
        window.removeEventListener('touchcancel', stableTouchCancelBlocker, true);
        document.removeEventListener('touchmove', stableTouchMoveBlocker, true);
        document.removeEventListener('touchend', stableTouchEndBlocker, true);
        document.removeEventListener('touchcancel', stableTouchCancelBlocker, true);
        window.removeEventListener('wheel', stableWheelBlocker, true);
        window.removeEventListener('scroll', stableScrollBlocker, true);
        document.removeEventListener('scroll', stableScrollBlocker, true);
        nativeTouchBlockerAttachedRef.current = false;
    }, [stableScrollBlocker, stableTouchCancelBlocker, stableTouchEndBlocker, stableTouchMoveBlocker, stableWheelBlocker]);

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
        window.addEventListener('wheel', stableWheelBlocker, DRAG_EVENT_OPTIONS);
        window.addEventListener('scroll', stableScrollBlocker, true);
        document.addEventListener('scroll', stableScrollBlocker, true);
        nativeTouchBlockerAttachedRef.current = true;
    }, [stableScrollBlocker, stableTouchCancelBlocker, stableTouchEndBlocker, stableTouchMoveBlocker, stableWheelBlocker]);

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
        const selection = selectionDragRef.current;
        const motions = selection?.members.map(member => member.motion) || [motionRef.current];
        motions.forEach(({ freeTextSwapRebaseFrame, categorySwapRebaseFrame }) => {
            if (freeTextSwapRebaseFrame !== null) window.cancelAnimationFrame(freeTextSwapRebaseFrame);
            if (categorySwapRebaseFrame !== null) window.cancelAnimationFrame(categorySwapRebaseFrame);
        });
        motionRef.current = createDragMotion();
        if (selection) delete selection.canvas.dataset.canvasSelectionDragging;
        selectionDragRef.current = null;
        setDraggedSelection([]);
        if (activeSelectionCanvasRef.current) preventCanvasDragClick(activeSelectionCanvasRef.current);
        activeSelectionCanvasRef.current = null;
        if (
            draggedItemRef.current?.type === 'category'
            && activePointerRef.current?.pointerType === 'touch'
            && dragSourceContextRef.current === 'product-designer'
            && typeof document !== 'undefined'
        ) {
            document.body.dataset.automenuSuppressProductOptionsUntil = String(Date.now() + 800);
        }
        releasePointerCapture();

        setDraggedItem(null);
        setLiveCategoryOrder(null);
        setLiveCategoryPageAssignments(null);
        setLiveCategoryPositions(null);
        setLiveProductOrder(null);
        setLiveCanvasLayers(null);

        draggedItemRef.current = null;
        activePointerRef.current = null;
        liveCategoryOrderRef.current = null;
        liveCategoryPageAssignmentsRef.current = null;
        liveCategoryPositionsRef.current = null;
        liveProductOrderRef.current = null;
        dragSourceContextRef.current = null;
        if (productDesignerAutoScrollFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(productDesignerAutoScrollFrameRef.current);
        }
        productDesignerAutoScrollFrameRef.current = null;
        productDesignerAutoScrollPointerRef.current = null;
        productDesignerScrollContainerRef.current = null;
        clearTouchCancelCommit();
        freeTextActiveCategoryRef.current = {};
        lastNativeTouchMoveAtRef.current = 0;
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
        const draggedItems = selectionDragRef.current?.members.map(member => member.item)
            || (draggedItemRef.current ? [draggedItemRef.current] : []);
        const categories = draggedItems.filter(item => item.type === 'category');
        const categoryOrderSnapshot = liveCategoryOrderRef.current;
        const categoryAssignmentsSnapshot = liveCategoryPageAssignmentsRef.current;
        const categoryPositionsSnapshot = liveCategoryPositionsRef.current;

        if (shouldCommit) {
            if (categoryOrderSnapshot && onCommitCategoryOrder) {
                onCommitCategoryOrder(categoryOrderSnapshot);
            }

            if (
                categories.length > 0 &&
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

                const isCanvasDrag = dragSourceContextRef.current !== 'product-designer';
                onStyleUpdate((prev) => {
                    const categoryPositions = { ...(categoryPositionsSnapshot || prev.categoryPositions || {}) };
                    const categoryPlacements = { ...(prev.categoryPlacements || {}) };
                    if (isCanvasDrag) {
                        categories.forEach(({ id }) => {
                            if (categoryAssignmentsSnapshot[id]) categoryPlacements[id] = categoryAssignmentsSnapshot[id];
                        });
                        Object.entries(categoryPositions).forEach(([category, position]) => {
                            if (category.startsWith(FREE_TEXT_PREFIX)) {
                                categoryPlacements[category] = { pageIndex: position.pageIndex, columnIndex: position.columnIndex };
                            }
                        });
                    } else if (!isCanvasDrag) {
                        Object.assign(categoryPlacements, categoryAssignmentsSnapshot);
                        if ((prev.categoryColumnCount || 1) > 1) {
                            Object.keys(categoryPlacements).forEach((category) => {
                                if (!categoryPositions[category]) delete categoryPlacements[category];
                            });
                        }
                    }
                    return {
                        ...prev,
                        pageBreaks: isCanvasDrag ? prev.pageBreaks : nextPageBreaks,
                        categoryPlacements,
                        categoryPositions,
                        name: 'Custom',
                    };
                });
            }

            const draggedFreeTexts = draggedItems.flatMap(item => {
                const product = item.type === 'product' && products.find(candidate => candidate.id === item.id);
                return product && product.isFreeText ? [product] : [];
            });
            const hasDetachedFreeText = draggedFreeTexts.some(product =>
                (freeTextActiveCategoryRef.current[product.id] || product.category).startsWith(FREE_TEXT_PREFIX));
            if (
                hasDetachedFreeText &&
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

            if (
                draggedFreeTexts.length > 0 &&
                categoryPositionsSnapshot &&
                onStyleUpdate
            ) {
                onStyleUpdate((previous) => ({
                    ...previous,
                    categoryPositions: { ...categoryPositionsSnapshot },
                    name: 'Custom',
                }));
            }

            if (liveProductOrderRef.current && onCommitProductOrder) {
                Object.entries(liveProductOrderRef.current).forEach(([category, order]) => {
                    onCommitProductOrder(category, order);
                });
            }
        }

        const layers = selectionDragRef.current?.layers;
        if (layers && onStyleUpdate) {
            onStyleUpdate(previous => ({ ...previous, ...layers, name: 'Custom' }));
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
        const motion = motionRef.current;
        if (typeof window === 'undefined') return;

        if (motion.freeTextSwapRebaseFrame !== null) {
            window.cancelAnimationFrame(motion.freeTextSwapRebaseFrame);
        }

        const applyRebase = (current: FreeTextSwapRebase, allowAnyGroup: boolean) => {
            const sourceElement =
                getRenderedDragElement('product', current.sourceId, current.sourceCategory) ||
                (allowAnyGroup ? getRenderedDragElement('product', current.sourceId) : null);
            const sourceRect = sourceElement?.getBoundingClientRect();
            if (!sourceRect) return false;

            const sourceProduct = getLatestProductById(current.sourceId);
            const rawMargin = Number(sourceProduct?.customMarginTop);
            motion.freeTextPointerOffsetY = current.pointer.y - sourceRect.top;
            motion.freeTextPointerOffsetX = current.pointer.x - sourceRect.left;
            freeTextActiveCategoryRef.current[current.sourceId] = current.sourceCategory;
            motion.freeTextDragSlot = {
                category: current.sourceCategory,
                marginTop: Number.isFinite(rawMargin) ? rawMargin : 0,
            };
            motion.lastPointer = current.pointer;
            return true;
        };

        if (applyRebase(rebase, false)) {
            motion.freeTextSwapRebase = null;
            motion.freeTextSwapRebaseFrame = null;
            return;
        }

        motion.freeTextSwapRebase = rebase;
        motion.freeTextSwapRebaseFrame = window.requestAnimationFrame(() => {
            motion.freeTextSwapRebaseFrame = null;
            const current = motion.freeTextSwapRebase;
            if (!current || !isDraggingRef.current || (!selectionDragRef.current && draggedItemRef.current?.id !== current.sourceId)) {
                motion.freeTextSwapRebase = null;
                return;
            }

            applyRebase(current, true);
            motion.freeTextSwapRebase = null;
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
            motionRef.current.productInsertionIndex = group
                ? initialOrder[group]?.indexOf(productId) ?? null
                : null;
            initializeLiveProductOrder(initialOrder);

            const currentElement = getRenderedDragElement('product', productId, group)
                || getRenderedDragElement('product', productId);
            motionRef.current.productDragStartRect = currentElement?.getBoundingClientRect() || null;
            motionRef.current.productInitialIndexById = new Map(
                (group ? initialOrder[group] || [] : []).map((id, index) => [id, index])
            );
            motionRef.current.productInitialTargetById = new Map();
            if (group && typeof document !== 'undefined') {
                const scope = escapeSelectorValue(dragScope);
                const groupSelector = escapeSelectorValue(group);
                document.querySelectorAll<HTMLElement>(
                    `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group="${groupSelector}"]`
                ).forEach(element => {
                    const id = element.dataset.dragId;
                    if (!id || !element.getClientRects().length) return;
                    const lane = element.closest<HTMLElement>('[data-drag-column-container="category"]');
                    motionRef.current.productInitialTargetById.set(id, {
                        rect: element.getBoundingClientRect(), laneKey: getCategoryLaneKey(lane?.dataset.dragPageIndex, lane?.dataset.dragColumnIndex),
                    });
                });
            }
            const currentLane = currentElement?.closest<HTMLElement>(
                '[data-drag-column-container="category"][data-drag-page-index][data-drag-column-index]'
            );
            motionRef.current.categoryActivePageIndex = currentLane
                ? Number(currentLane.dataset.dragPageIndex ?? 0)
                : null;
            motionRef.current.categoryActiveLaneKey = currentLane
                ? getCategoryLaneKey(currentLane.dataset.dragPageIndex, currentLane.dataset.dragColumnIndex)
                : null;
            motionRef.current.categoryPageSwitchOriginX = pointer?.x
                ?? (currentElement ? currentElement.getBoundingClientRect().left : null);
        },
        [createProductOrderSnapshot, dragScope, getRenderedDragElement, initializeLiveProductOrder]
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
            if (!selectionDragRef.current || selectionDragRef.current.members[0]?.item.id === productId) setDraggedItem(nextItem);
        }
    }, []);

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
                const scale = pageRect && pageRect.height > 0 ? pageRect.height / Math.max(1, pageElement?.offsetHeight || 1) : 1;
                const margins = resolveMenuMargins(style);
                const topPadding = margins.top * scale;
                const pageSafeBottom = pageRect
                    ? pageRect.bottom - getPaginationBottomInset(style) * scale
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
                ? Math.max(0.001, currentPageRect.width / Math.max(1, currentPage?.offsetWidth || 1))
                : 1;
            motionRef.current.categoryPointerOffsetY = currentRect
                ? Math.max(0, Math.min(currentRect.height, pointer.y - currentRect.top))
                : 0;
            motionRef.current.categoryDraggedHeight = currentRect
                ? currentRect.height / currentScale
                : null;
            if (currentElement && currentRect && currentPageRect) {
                motionRef.current.vacatedCategoryPosition = {
                    pageIndex: Number(currentElement.dataset.dragPageIndex ?? 0),
                    columnIndex: Number(currentElement.dataset.dragColumnIndex ?? 0),
                    y: (currentRect.top - currentPageRect.top) / currentScale,
                    pageX: (currentRect.left - currentPageRect.left) / currentScale,
                };
            }
            const currentPositions = { ...(style.categoryPositions || {}) };
            setLiveCategoryPositions(currentPositions);
            liveCategoryPositionsRef.current = currentPositions;
            motionRef.current.categorySwapLock = null;
            motionRef.current.categoryActivePageIndex = currentElement
                ? Number(currentElement.dataset.dragPageIndex ?? 0)
                : null;
            motionRef.current.categoryActiveLaneKey = currentElement
                ? getCategoryLaneKey(currentElement.dataset.dragPageIndex, currentElement.dataset.dragColumnIndex)
                : null;
            motionRef.current.categoryPageSwitchOriginX = pointer.x;
        },
        [getCurrentCategoryAssignments, getRenderedDragElement, initializeLiveCategoryOrder, initializeLiveCategoryPageAssignments, style.categoryPositions]
    );

    const rebaseCategoryAfterSwap = useCallback((rebase: CategorySwapRebase) => {
        const motion = motionRef.current;
        if (typeof window === 'undefined') return;
        if (motion.categorySwapRebaseFrame !== null) {
            window.cancelAnimationFrame(motion.categorySwapRebaseFrame);
        }

        motion.categorySwapRebase = rebase;
        let attempts = 0;
        const applyRebase = () => {
            const current = motion.categorySwapRebase;
            if (!current) {
                motion.categorySwapRebaseFrame = null;
                return;
            }

            const sourceElement = getRenderedDragElement('category', current.sourceId);
            const sourceRect = sourceElement?.getBoundingClientRect();
            const pageElement = sourceElement?.closest<HTMLElement>(
                '[data-drag-page-container="category"][data-drag-page-index]'
            );
            const pageRect = pageElement?.getBoundingClientRect();
            if (!sourceElement || !sourceRect || !pageElement || !pageRect) {
                attempts += 1;
                if (attempts < 3) {
                    motion.categorySwapRebaseFrame = window.requestAnimationFrame(applyRebase);
                } else {
                    motion.categorySwapRebaseFrame = null;
                    motion.categorySwapRebase = null;
                }
                return;
            }

            const scale = Math.max(0.001, pageRect.width / Math.max(1, pageElement.offsetWidth));
            motion.categoryPointerOffsetY = Math.max(
                0,
                Math.min(sourceRect.height, current.pointer.y - sourceRect.top),
            );
            motion.categoryDraggedHeight = sourceRect.height / scale;
            motion.categorySwapRebaseFrame = null;
            motion.categorySwapRebase = null;
        };

        motion.categorySwapRebaseFrame = window.requestAnimationFrame(applyRebase);
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
        const scale = Math.max(0.001, pageRect.width / Math.max(1, page.offsetWidth));
        const elementHeight = elementRect.height > 0
            ? elementRect.height
            : (motionRef.current.categoryDraggedHeight || 0) * scale;
        if (elementHeight > 0) {
            motionRef.current.categoryDraggedHeight = elementHeight / scale;
        }
        const pointerOffset = motionRef.current.categoryPointerOffsetY !== null
            ? motionRef.current.categoryPointerOffsetY
            : Math.min(24 * scale, elementHeight / 2);
        const minimumTop = lane.rect.top;
        const maximumBottom = lane.rect.bottom;
        if (elementHeight > maximumBottom - minimumTop) return false;

        const desiredTop = Math.max(minimumTop, Math.min(maximumBottom - elementHeight, pointer.y - pointerOffset));
        const currentPositions = liveCategoryPositionsRef.current || style.categoryPositions || {};
        const previousPosition = currentPositions[categoryId];
        const currentOrder = liveCategoryOrderRef.current || sortedCategoriesRef.current;
        const orderWithoutDragged = currentOrder.filter((id) => id !== categoryId);
        const obstacles = [
            ...lane.element.querySelectorAll<HTMLElement>('[data-category-chunk]:not([data-free-positioned])'),
            ...page.querySelectorAll<HTMLElement>('[data-category-chunk][data-free-positioned="true"]'),
        ]
            .filter((chunk) => chunk.dataset.categoryChunk !== categoryId)
            .map((chunk) => ({ id: chunk.dataset.categoryChunk!, rect: chunk.getBoundingClientRect() }))
            .filter(({ rect }) => rect.left < lane.rect.right && rect.right > lane.rect.left)
            .sort((left, right) => left.rect.top - right.rect.top);
        const gap = CATEGORY_CHUNK_GAP_PX * scale;
        const currentIndex = currentOrder.indexOf(categoryId);
        let firstTop = minimumTop;
        let lastBottom = maximumBottom;
        for (const obstacle of obstacles) {
            if (!isSelectedCategoryTarget(obstacle.id)) continue;
            const peerIndex = currentOrder.indexOf(obstacle.id);
            if (peerIndex < currentIndex) firstTop = Math.max(firstTop, obstacle.rect.bottom + gap);
            else if (peerIndex > currentIndex) lastBottom = Math.min(lastBottom, obstacle.rect.top - gap);
        }
        let gapStart = minimumTop;
        let nearestSlot: { top: number; nextCategory?: string } | undefined;
        for (const obstacle of [...obstacles, null]) {
            const start = Math.max(gapStart, firstTop);
            const end = Math.min(obstacle ? obstacle.rect.top - gap : maximumBottom, lastBottom);
            const lastTop = end - elementHeight;
            if (lastTop + 0.25 >= start) {
                const top = Math.max(start, Math.min(lastTop, desiredTop));
                if (!nearestSlot || Math.abs(top - desiredTop) < Math.abs(nearestSlot.top - desiredTop)) {
                    nearestSlot = { top, nextCategory: obstacle?.id };
                }
            }
            if (obstacle) gapStart = Math.max(gapStart, obstacle.rect.bottom + gap);
        }
        if (!nearestSlot) return false;

        const anchorId = nearestSlot.nextCategory || obstacles[obstacles.length - 1]?.id;
        const anchorIndex = anchorId ? orderWithoutDragged.indexOf(anchorId) : -1;
        if (anchorIndex >= 0) {
            const insertionIndex = nearestSlot.nextCategory ? anchorIndex : anchorIndex + 1;
            const nextOrder = moveItemToInsertionIndex(currentOrder, categoryId, insertionIndex, isSelectedCategoryTarget);
            if (!areOrdersEqual(nextOrder, currentOrder)) {
                liveCategoryOrderRef.current = nextOrder;
                setLiveCategoryOrder(nextOrder);
                hasDragMutationRef.current = true;
            }
        }

        const remainsInLane = getCategoryLaneKey(element.dataset.dragPageIndex, element.dataset.dragColumnIndex) === activeLaneKey;
        const naturalTop = elementRect.top - (Number(element.dataset.categoryFlowOffset || 0) * scale);
        if (remainsInLane && Math.abs(nearestSlot.top - naturalTop) <= 0.5) {
            if (previousPosition) {
                const nextPositions = { ...currentPositions };
                delete nextPositions[categoryId];
                liveCategoryPositionsRef.current = nextPositions;
                setLiveCategoryPositions(nextPositions);
                hasDragMutationRef.current = true;
            }
            return true;
        }

        const nextPosition: CategoryPosition = {
            pageIndex: activePageIndex,
            columnIndex: activeColumnIndex,
            y: Math.max(0, (nearestSlot.top - pageRect.top) / scale),
        };
        if (
            previousPosition?.pageIndex === nextPosition.pageIndex
            && previousPosition?.columnIndex === nextPosition.columnIndex
            && previousPosition?.y === nextPosition.y
        ) {
            return true;
        }

        const nextPositions = {
            ...currentPositions,
            [categoryId]: nextPosition,
        };
        liveCategoryPositionsRef.current = nextPositions;
        setLiveCategoryPositions(nextPositions);
        hasDragMutationRef.current = true;
        return true;
    }, [dragScope, getCategoryLanes, getRenderedDragElement, isSelectedCategoryTarget, style.categoryPositions]);

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
                motionRef.current.freeTextDragSlot = {
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
                    motionRef.current.categoryActivePageIndex = pointerLane.pageIndex;
                    motionRef.current.categoryActiveLaneKey = pointerLane.key;
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

            const switchOriginX = motionRef.current.categoryPageSwitchOriginX ?? pointer.x;
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

    const swapCategoryWithFreeText = useCallback((
        category: HTMLElement, text: HTMLElement, categoryOrigin?: CategoryPosition | null, textOrigin?: CategoryPosition | null,
    ) => {
        const categoryId = category.dataset.dragId;
        const textId = text.dataset.dragId;
        const categoryRect = category.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const categorySlot = getCanvasSlot(category, categoryRect);
        const textSlot = getCanvasSlot(text, textRect);
        if (!categoryId || !textId || !categorySlot || !textSlot) return null;
        const categoryPosition = categoryOrigin || categorySlot.position;
        const textPosition = textOrigin || textSlot.position;
        const sameColumn = categoryPosition.pageIndex === textPosition.pageIndex && categoryPosition.columnIndex === textPosition.columnIndex;
        const categoryHeight = categoryRect.height / categorySlot.scale;
        const textHeight = textRect.height / textSlot.scale;
        const gap = 8;
        const nextCategory = {
            pageIndex: textPosition.pageIndex, columnIndex: textPosition.columnIndex,
            y: sameColumn && categoryPosition.y < textPosition.y
                ? Math.max(textPosition.y, categoryPosition.y + textHeight + gap) : textPosition.y,
        };
        const nextText = { ...categoryPosition };
        if (sameColumn && categoryPosition.y >= textPosition.y) {
            nextText.y = Math.max(nextText.y, nextCategory.y + categoryHeight + gap);
        }
        const page = categorySlot.position.pageIndex === nextText.pageIndex ? categorySlot.page
            : document.querySelector<HTMLElement>(
                `[data-drag-scope="${escapeSelectorValue(dragScope)}"][data-drag-page-container="category"][data-drag-page-index="${nextText.pageIndex}"]`,
            );
        if (!page) return null;
        const pageRect = page.getBoundingClientRect();
        const scale = pageRect.width / Math.max(1, page.offsetWidth);
        const textWidth = textRect.width / textSlot.scale;
        nextText.pageX = Math.min(Math.max(0, nextText.pageX || 0), Math.max(0, page.offsetWidth - textWidth));
        const textLeft = pageRect.left + nextText.pageX * scale;
        const desiredTop = pageRect.top + nextText.y * scale;
        const safeTop = getCollisionSafeFreeTextTop({
            root: page, desiredTop, pointerY: desiredTop, height: textHeight * scale,
            minTop: sameColumn && categoryPosition.y >= textPosition.y
                ? pageRect.top + (nextCategory.y + categoryHeight + gap) * scale : pageRect.top,
            maxBottom: pageRect.bottom, minLeft: textLeft, maxRight: textLeft + textWidth * scale,
            excludeProductIds: (groupedProductsRef.current[textId] || []).map(product => product.id),
            excludeCategoryId: categoryId,
            additionalObstacles: sameColumn ? [new DOMRect(
                textLeft, pageRect.top + nextCategory.y * scale, textWidth * scale, categoryHeight * scale,
            )] : [],
        });
        if (safeTop === null || safeTop + textHeight * scale > pageRect.bottom + 1) return null;
        nextText.y = (safeTop - pageRect.top) / scale;

        const order = [...(liveCategoryOrderRef.current || sortedCategoriesRef.current)];
        const categoryIndex = order.indexOf(categoryId);
        const textIndex = order.indexOf(textId);
        if (categoryIndex < 0 || textIndex < 0) return null;
        [order[categoryIndex], order[textIndex]] = [order[textIndex], order[categoryIndex]];
        const placements = {
            ...(liveCategoryPageAssignmentsRef.current || getCurrentCategoryAssignments()),
            [categoryId]: { pageIndex: nextCategory.pageIndex, columnIndex: nextCategory.columnIndex },
            [textId]: { pageIndex: nextText.pageIndex, columnIndex: nextText.columnIndex },
        };
        const positions = { ...(liveCategoryPositionsRef.current || style.categoryPositions), [categoryId]: nextCategory, [textId]: nextText };
        sortedCategoriesRef.current = order;
        liveCategoryOrderRef.current = order;
        liveCategoryPositionsRef.current = positions;
        liveCategoryPageAssignmentsRef.current = placements;
        hasDragMutationRef.current = true;
        flushSync(() => {
            setLiveCategoryOrder(order);
            setLiveCategoryPositions(positions);
            setLiveCategoryPageAssignments(placements);
        });
        return { category: nextCategory, text: nextText };
    }, [dragScope, getCurrentCategoryAssignments, style.categoryPositions]);

    const reorderCategoryByPointer = useCallback(
        (pointer: { x: number; y: number }, options: { commitImmediately?: boolean } = {}) => {
            const currentDragItem = draggedItemRef.current;
            if (!currentDragItem || currentDragItem.type !== 'category') return;
            const commitImmediately = options.commitImmediately ?? true;

            const isProductDesignerDrag = dragSourceContextRef.current === 'product-designer';
            if (isProductDesignerDrag) {
                const startPointer = motionRef.current.dragStartPointer;
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

            const activeSwapLock = motionRef.current.categorySwapLock;
            if (activeSwapLock?.sourceId === currentDragItem.id && currentElement) {
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
                if (containersAreSeparated) motionRef.current.categorySwapLock = null;
            }

            const currentPageIndex =
                motionRef.current.categoryActivePageIndex ??
                currentAssignment?.pageIndex ??
                Number(currentElement?.dataset.dragPageIndex ?? 0);
            const activePageIndex = resolveCategoryPageIndex(pointer, currentPageIndex, true);
            if (activePageIndex === null) return;

            if (activePageIndex !== currentPageIndex) {
                motionRef.current.categoryPageSwitchOriginX = pointer.x;
            }
            motionRef.current.categoryActivePageIndex = activePageIndex;

            const currentLaneKey =
                motionRef.current.categoryActiveLaneKey ||
                (currentElement
                    ? getCategoryLaneKey(currentElement.dataset.dragPageIndex, currentElement.dataset.dragColumnIndex)
                    : currentAssignment
                        ? getCategoryLaneKey(String(currentAssignment.pageIndex), String(currentAssignment.columnIndex))
                        : null);
            const activeLaneKey = resolveCategoryLaneKey(pointer, activePageIndex, currentLaneKey, true);
            if (!activeLaneKey) return;

            const changedLane = activeLaneKey !== currentLaneKey;

            motionRef.current.categoryActiveLaneKey = activeLaneKey;

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
                hasDragMutationRef.current = true;
            };

            const orderWithoutDragged = currentOrder.filter((id) => id !== currentDragItem.id);
            const orderedTargets = getOrderedCategoryTargets()
                .filter((target) => target.id !== currentDragItem.id && !target.id.startsWith(FREE_TEXT_PREFIX) && !isSelectedCategoryTarget(target.id));
            const laneTargets = orderedTargets
                .filter((target) => target.laneKey === activeLaneKey)
                .sort((left, right) => left.rect.top - right.rect.top);

            if (!isProductDesignerDrag && currentElement) {
                const previous = motionRef.current.lastPointer || pointer;
                const lock = motionRef.current.categoryFreeTextSwap;
                if (lock && (Math.hypot(pointer.x - lock.x, pointer.y - lock.y) <= 8
                    || (pointer.y >= lock.rect.top - 8 && pointer.y <= lock.rect.bottom + 8
                        && pointer.x >= lock.rect.left - 12 && pointer.x <= lock.rect.right + 12))) return;
                const lane = getCategoryLanes().find(candidate => candidate.key === activeLaneKey);
                const textTarget = getOrderedCategoryTargets()
                    .filter(target => target.id.startsWith(FREE_TEXT_PREFIX)
                        && !isSelectedCategoryTarget(target.id)
                        && (target.id !== lock?.id || (Math.sign(pointer.y - lock.y) !== lock.direction && Math.abs(pointer.y - lock.y) > 8))
                        && (target.laneKey === activeLaneKey || (target.element.dataset.dragPageIndex === String(activePageIndex)
                            && pointer.x >= target.rect.left && pointer.x <= target.rect.right))
                        && crossesTarget(previous, pointer, target.rect, lane?.rect))
                    .sort((a, b) => Math.abs(a.rect.top - pointer.y) - Math.abs(b.rect.top - pointer.y))[0];
                if (textTarget) {
                    const swapped = swapCategoryWithFreeText(currentElement, textTarget.element, motionRef.current.vacatedCategoryPosition);
                    if (swapped) {
                        motionRef.current.categoryFreeTextSwap = { id: textTarget.id, rect: textTarget.rect, ...pointer, direction: Math.sign(pointer.y - previous.y) };
                        motionRef.current.vacatedCategoryPosition = swapped.category;
                        motionRef.current.categoryActiveLaneKey = getCategoryLaneKey(String(swapped.category.pageIndex), String(swapped.category.columnIndex));
                        motionRef.current.categoryActivePageIndex = swapped.category.pageIndex;
                        rebaseCategoryAfterSwap({ sourceId: currentDragItem.id, pointer });
                        return;
                    }
                }
            }

            if (changedLane && !isProductDesignerDrag && !laneTargets.some((target) => (
                pointer.y >= target.rect.top && pointer.y <= target.rect.bottom
            )) && updateDraggedCategoryPosition(currentDragItem.id, pointer, activePageIndex, activeColumnIndex, activeLaneKey)) {
                updateDraggedAssignment();
                return;
            }

            if (changedLane) {
                const currentRect = currentElement?.getBoundingClientRect();
                const pointerOffset = motionRef.current.categoryPointerOffsetY ?? 0;
                const projectedTop = currentRect ? pointer.y - pointerOffset : pointer.y;
                const projectedHeight = currentRect?.height || 0;
                const projectedBottom = projectedTop + projectedHeight;
                const projectedCenterY = projectedTop + (projectedHeight / 2);
                const overlappingTarget = laneTargets
                    .map((target) => ({
                        target,
                        overlap: Math.max(0, Math.min(projectedBottom, target.rect.bottom) - Math.max(projectedTop, target.rect.top)),
                    }))
                    .filter((candidate) => candidate.overlap > 0)
                    .sort((left, right) => right.overlap - left.overlap || Math.abs(left.target.rect.top - projectedTop) - Math.abs(right.target.rect.top - projectedTop))[0]?.target;
                const nextTarget = overlappingTarget
                    || laneTargets.find((target) => target.rect.top + (target.rect.height / 2) >= projectedCenterY);
                const anchorTarget = nextTarget || laneTargets[laneTargets.length - 1];
                let desiredInsertionIndex = orderWithoutDragged.length;
                let targetPosition: 'before' | 'after' = nextTarget ? 'before' : 'after';

                if (anchorTarget) {
                    const anchorIndex = orderWithoutDragged.indexOf(anchorTarget.id);
                    if (anchorIndex !== -1) {
                        desiredInsertionIndex = anchorIndex + (targetPosition === 'after' ? 1 : 0);
                    }
                } else {
                    const lanes = getCategoryLanes();
                    const activeLaneIndex = lanes.findIndex((lane) => lane.key === activeLaneKey);
                    const laneIndexes = new Map(lanes.map((lane, index) => [lane.key, index]));
                    const followingTarget = activeLaneIndex === -1
                        ? null
                        : orderedTargets.find((target) => (laneIndexes.get(target.laneKey) ?? -1) > activeLaneIndex);
                    const precedingTarget = activeLaneIndex === -1
                        ? null
                        : [...orderedTargets].reverse().find((target) => {
                            const laneIndex = laneIndexes.get(target.laneKey) ?? -1;
                            return laneIndex !== -1 && laneIndex < activeLaneIndex;
                        });
                    const boundaryTarget = followingTarget || precedingTarget;
                    if (boundaryTarget) {
                        const boundaryIndex = orderWithoutDragged.indexOf(boundaryTarget.id);
                        targetPosition = followingTarget ? 'before' : 'after';
                        desiredInsertionIndex = boundaryIndex === -1
                            ? orderWithoutDragged.length
                            : boundaryIndex + (targetPosition === 'after' ? 1 : 0);
                    }
                }

                const newOrder = moveItemToInsertionIndex(currentOrder, currentDragItem.id, desiredInsertionIndex, isSelectedCategoryTarget);
                const currentPositions = liveCategoryPositionsRef.current || style.categoryPositions || {};
                const nextPositions = { ...currentPositions };
                const hadPosition = Boolean(nextPositions[currentDragItem.id]);
                delete nextPositions[currentDragItem.id];
                const nextAssignments = {
                    ...currentAssignments,
                    [currentDragItem.id]: {
                        pageIndex: activePageIndex,
                        columnIndex: activeColumnIndex,
                    },
                };
                const assignmentChanged = currentPlacement?.pageIndex !== activePageIndex
                    || currentPlacement?.columnIndex !== activeColumnIndex;
                const orderChanged = !areOrdersEqual(newOrder, currentOrder);
                if (!assignmentChanged && !orderChanged && !hadPosition) return;

                motionRef.current.categorySwapLock = anchorTarget ? {
                    sourceId: currentDragItem.id,
                    targetId: anchorTarget.id,
                    position: targetPosition,
                } : null;
                flushSync(() => {
                    if (hadPosition) {
                        liveCategoryPositionsRef.current = nextPositions;
                        setLiveCategoryPositions(nextPositions);
                    }
                    liveCategoryPageAssignmentsRef.current = nextAssignments;
                    setLiveCategoryPageAssignments(nextAssignments);
                    if (orderChanged) {
                        liveCategoryOrderRef.current = newOrder;
                        setLiveCategoryOrder(newOrder);
                    }
                    hasDragMutationRef.current = true;
                });

                motionRef.current.categoryActivePageIndex = activePageIndex;
                motionRef.current.categoryActiveLaneKey = activeLaneKey;
                rebaseCategoryAfterSwap({ sourceId: currentDragItem.id, pointer });
                if (commitImmediately && orderChanged) onCommitCategoryOrder?.(newOrder);
                return;
            }

            const pointerTarget = laneTargets.find((target) => (
                pointer.x >= target.rect.left
                && pointer.x <= target.rect.right
                && pointer.y >= target.rect.top
                && pointer.y <= target.rect.bottom
            ));
            const currentSwapLock = motionRef.current.categorySwapLock;
            if (
                pointerTarget
                && currentSwapLock?.sourceId === currentDragItem.id
                && currentSwapLock.targetId !== pointerTarget.id
            ) {
                motionRef.current.categorySwapLock = null;
            }
            const categoryDropTarget = (
                pointerTarget
                && !(
                    motionRef.current.categorySwapLock?.sourceId === currentDragItem.id
                    && motionRef.current.categorySwapLock.targetId === pointerTarget.id
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
            let targetPosition: 'before' | 'after' = pointer.y < targetCenterY ? 'before' : 'after';
            if (isProductDesignerDrag) {
                const sourceIndex = currentOrder.indexOf(currentDragItem.id);
                const targetCurrentIndex = currentOrder.indexOf(categoryDropTarget.id);
                const edgeOffset = categoryDropTarget.rect.height * PRODUCT_DESIGNER_CATEGORY_REORDER_EDGE_RATIO;
                if (sourceIndex < targetCurrentIndex) {
                    targetPosition = pointer.y >= categoryDropTarget.rect.top + edgeOffset ? 'after' : 'before';
                } else if (sourceIndex > targetCurrentIndex) {
                    targetPosition = pointer.y <= categoryDropTarget.rect.bottom - edgeOffset ? 'before' : 'after';
                }
            }
            const targetIndex = orderWithoutDragged.indexOf(categoryDropTarget.id);
            if (targetIndex === -1) return;
            const desiredInsertionIndex = targetIndex + (targetPosition === 'after' ? 1 : 0);
            const newOrder = moveItemToInsertionIndex(currentOrder, currentDragItem.id, desiredInsertionIndex, isSelectedCategoryTarget);
            if (areOrdersEqual(newOrder, currentOrder)) return;

            const currentPositions = liveCategoryPositionsRef.current || style.categoryPositions || {};
            const nextPositions = { ...currentPositions };
            delete nextPositions[currentDragItem.id];
            delete nextPositions[categoryDropTarget.id];
            const positionsChanged = (
                JSON.stringify(nextPositions[currentDragItem.id]) !== JSON.stringify(currentPositions[currentDragItem.id])
                || JSON.stringify(nextPositions[categoryDropTarget.id]) !== JSON.stringify(currentPositions[categoryDropTarget.id])
            );
            const targetAssignment = {
                pageIndex: Number(categoryDropTarget.element.dataset.dragPageIndex ?? activePageIndex),
                columnIndex: Number(categoryDropTarget.element.dataset.dragColumnIndex ?? activeColumnIndex),
            };
            const nextAssignments = {
                ...currentAssignments,
                [currentDragItem.id]: { ...targetAssignment },
            };

            motionRef.current.categorySwapLock = {
                sourceId: currentDragItem.id,
                targetId: categoryDropTarget.id,
                position: targetPosition,
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

            motionRef.current.categoryActivePageIndex = targetAssignment.pageIndex;
            motionRef.current.categoryActiveLaneKey = getCategoryLaneKey(
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
        [dragScope, getCategoryLanes, getOrderedCategoryTargets, getRenderedDragElement, isSelectedCategoryTarget, onCommitCategoryOrder, onStyleUpdate, rebaseCategoryAfterSwap, resolveCategoryLaneKey, resolveCategoryPageIndex, style.categoryPositions, swapCategoryWithFreeText, updateDraggedCategoryPosition]
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

            const nextOrder = moveItemToInsertionIndex(currentOrder, freeTextCategory, desiredInsertionIndex, isSelectedCategoryTarget);
            if (areOrdersEqual(nextOrder, currentOrder)) return;

            sortedCategoriesRef.current = nextOrder;
            liveCategoryOrderRef.current = nextOrder;
            setLiveCategoryOrder(nextOrder);
            hasDragMutationRef.current = true;
        },
        [getCategoryLanes, getOrderedCategoryTargets, isSelectedCategoryTarget]
    );

    const resolveProductInsertionIndex = useCallback(
        (
            pointer: { x: number; y: number },
            targets: ProductTarget[],
            orderWithoutDragged: string[],
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

            if (activeRow.row.length === 1) {
                const target = activeRow.row[0];
                const targetIndex = orderWithoutDragged.indexOf(target.id);
                if (targetIndex !== -1) {
                    const draggedId = draggedItemRef.current?.id || '';
                    const draggedInitialIndex = motionRef.current.productInitialIndexById.get(draggedId);
                    const targetInitialIndex = motionRef.current.productInitialIndexById.get(target.id);
                    const sourceRect = motionRef.current.productDragStartRect;
                    const targetInitialRect = motionRef.current.productInitialTargetById.get(target.id)?.rect;

                    if (
                        draggedInitialIndex !== undefined
                        && targetInitialIndex !== undefined
                        && sourceRect
                        && targetInitialRect
                    ) {
                        const sourceCenterX = sourceRect.left + (sourceRect.width / 2);
                        const sourceCenterY = sourceRect.top + (sourceRect.height / 2);
                        const targetCenterX = targetInitialRect.left + (targetInitialRect.width / 2);
                        const targetCenterY = targetInitialRect.top + (targetInitialRect.height / 2);
                        const horizontalFlow = Math.abs(sourceCenterX - targetCenterX) > Math.abs(sourceCenterY - targetCenterY);
                        const threshold = horizontalFlow
                            ? (sourceCenterX + targetCenterX) / 2
                            : (sourceCenterY + targetCenterY) / 2;
                        const reachedTarget = draggedInitialIndex > targetInitialIndex
                            ? (horizontalFlow ? pointer.x <= threshold : pointer.y <= threshold)
                            : (horizontalFlow ? pointer.x >= threshold : pointer.y >= threshold);

                        if (draggedInitialIndex > targetInitialIndex) {
                            return reachedTarget ? targetIndex : targetIndex + 1;
                        }
                        if (draggedInitialIndex < targetInitialIndex) {
                            return reachedTarget ? targetIndex + 1 : targetIndex;
                        }
                    }
                    return pointer.y <= target.rect.top + (target.rect.height / 2)
                        ? targetIndex
                        : targetIndex + 1;
                }
            }

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
        (pointer: { x: number; y: number }, _movement: { x: number; y: number }) => {
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
            const currentPageIndex = motionRef.current.categoryActivePageIndex
                ?? Number(currentLane?.dataset.dragPageIndex ?? 0);
            const activePageIndex = resolveCategoryPageIndex(pointer, currentPageIndex);
            if (activePageIndex === null) return;

            if (activePageIndex !== currentPageIndex) {
                motionRef.current.categoryPageSwitchOriginX = pointer.x;
            }
            motionRef.current.categoryActivePageIndex = activePageIndex;

            const currentLaneKey = motionRef.current.categoryActiveLaneKey
                || getCategoryLaneKey(currentLane?.dataset.dragPageIndex, currentLane?.dataset.dragColumnIndex);
            const activeLaneKey = resolveCategoryLaneKey(pointer, activePageIndex, currentLaneKey);
            if (!activeLaneKey) return;
            motionRef.current.categoryActiveLaneKey = activeLaneKey;

            const selection = selectionDragRef.current;
            const initialOrder = selection ? [...motionRef.current.productInitialIndexById.keys()] : [];
            const synchronizedProducts = selection && !draggedProduct.isFreeText
                && initialOrder.length === currentOrder.length
                && currentOrder.every(id => motionRef.current.productInitialIndexById.has(id) && !selection.freeTextIds.has(id))
                ? selection.members.filter(member => selection.productIds.has(member.item.id) && initialOrder.includes(member.item.id))
                : [];
            if (synchronizedProducts.length > 1) {
                const deltaX = pointer.x - (motionRef.current.dragStartPointer?.x ?? pointer.x);
                const deltaY = pointer.y - (motionRef.current.dragStartPointer?.y ?? pointer.y);
                const direction = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
                const anchor = synchronizedProducts.find(member => {
                    const index = initialOrder.indexOf(member.item.id);
                    const candidates = direction < 0 ? initialOrder.slice(0, index) : initialOrder.slice(index + 1);
                    return candidates.some(id => !selection?.productIds.has(id));
                }) || synchronizedProducts[0];
                if (anchor.item.id !== currentDragItem.id) return;
            }
            const allTargets = getOrderedProductTargets(sourceGroup, currentOrder)
                .filter(target => target.id !== currentDragItem.id && !isSelectedProductTarget(target.id))
                .map(target => {
                    const initial = selection && motionRef.current.productInitialTargetById.get(target.id);
                    // A preceding reorder can move a target into the dragged item's previous slot.
                    return initial && initial.laneKey === target.laneKey ? { ...target, rect: initial.rect } : target;
                });
            const laneTargets = allTargets.filter((target) => target.laneKey === activeLaneKey);
            let desiredInsertionIndex: number;

            if (laneTargets.length > 0) {
                desiredInsertionIndex = resolveProductInsertionIndex(
                    pointer,
                    laneTargets,
                    orderWithoutDragged,
                );
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
                        Math.min(motionRef.current.productInsertionIndex ?? currentIndex, orderWithoutDragged.length)
                    );
                }
            }
            const newOrder = selection && synchronizedProducts.length > 1
                ? moveSelectedProducts(initialOrder, currentOrder, selection.productIds, currentDragItem.id, desiredInsertionIndex)
                : moveItemToInsertionIndex(currentOrder, currentDragItem.id, desiredInsertionIndex, selection ? isSelectedProductTarget : undefined);
            motionRef.current.productInsertionIndex = newOrder.indexOf(currentDragItem.id);
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
            }
        },
        [getCategoryLanes, getLatestProductById, getOrderedProductTargets, getRenderedDragElement, isSelectedProductTarget, onStyleUpdate, resolveCategoryLaneKey, resolveCategoryPageIndex, resolveProductInsertionIndex]
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
                '[data-added-image-drag="true"]:not([data-canvas-background-layer]), #menu-title-text, #menu-subtitle-text'
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
                    !isSelectedProductTarget(target.id) &&
                    !isSelectedCategoryTarget(target.category) &&
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
                    !isSelectedCategoryTarget(target.category) &&
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
                .filter((element) => element.dataset.dragId !== productId && !isSelectedProductTarget(element.dataset.dragId || ''))
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
        [dragScope, isSelectedCategoryTarget, isSelectedProductTarget, style.columnCount]
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
        const lock = motionRef.current.freeTextSwapLock;
        const sourceCenterY = sourceRect.top + sourceRect.height / 2;
        const candidates = Array.from(document.querySelectorAll<HTMLElement>(
            `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group]`
        ))
            .filter((element) => element.dataset.dragId !== productId
                && !isSelectedProductTarget(element.dataset.dragId || '')
                && !(lock?.sourceId === productId && element.dataset.dragId === lock.targetId))
            .map((element) => {
                const id = element.dataset.dragId || '';
                const product = id ? getLatestProductById(id) : null;
                return {
                    product,
                    rect: element.getBoundingClientRect(),
                };
            })
            .filter((target): target is { product: Product; rect: DOMRect } => {
                const targetCenterY = target.rect.top + target.rect.height / 2;
                return Boolean(target.product?.isFreeText)
                    && (direction === 'down' ? targetCenterY > sourceCenterY : targetCenterY < sourceCenterY);
            });
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
    }, [dragScope, getLatestProductById, isSelectedProductTarget]);

    const getHorizontalFreeTextSwapTarget = useCallback(({
        productId,
        sourceRect,
        projectedLeft,
        direction,
    }: {
        productId: string;
        sourceRect: DOMRect;
        projectedLeft: number;
        direction: 'left' | 'right';
    }) => {
        if (typeof document === 'undefined') return null;
        const scope = escapeSelectorValue(dragScope);
        const sourceCenter = sourceRect.left + sourceRect.width / 2;
        const targets = Array.from(document.querySelectorAll<HTMLElement>(
            `[data-drag-scope="${scope}"][data-drag-type="product"][data-drag-id][data-drag-group]`
        ))
            .filter((element) => element.dataset.dragId !== productId && !isSelectedProductTarget(element.dataset.dragId || ''))
            .map((element) => ({
                product: getLatestProductById(element.dataset.dragId || ''),
                rect: element.getBoundingClientRect(),
            }))
            .filter((target): target is { product: Product; rect: DOMRect } => Boolean(
                target.product?.isFreeText
                && target.rect.bottom > sourceRect.top
                && target.rect.top < sourceRect.bottom
                && (direction === 'right'
                    ? target.rect.left + target.rect.width / 2 > sourceCenter
                    : target.rect.left + target.rect.width / 2 < sourceCenter)
            ))
            .sort((left, right) => direction === 'right'
                ? left.rect.left - right.rect.left
                : right.rect.right - left.rect.right);
        const target = targets[0];
        if (!target) return null;
        const projectedCenter = projectedLeft + sourceRect.width / 2;
        const targetCenter = target.rect.left + target.rect.width / 2;
        return {
            ...target,
            shouldSwap: direction === 'right' ? projectedCenter >= targetCenter : projectedCenter <= targetCenter,
        };
    }, [dragScope, getLatestProductById, isSelectedProductTarget]);

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
        if (!targetProduct.isFreeText || product.id === targetProduct.id || isSelectedProductTarget(targetProduct.id)) {
            return { moved: false, shouldLock: false };
        }

        const sourceCategory = freeTextActiveCategoryRef.current[product.id] || product.category;
        const targetCategory = freeTextActiveCategoryRef.current[targetProduct.id] || targetProduct.category;
        const sourceSlot = motionRef.current.freeTextDragSlot?.category === sourceCategory
            ? motionRef.current.freeTextDragSlot
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

        motionRef.current.freeTextDragSlot = {
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
        isSelectedProductTarget,
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
            motionRef.current.freeTextPointerOffsetY = currentRect ? pointer.y - currentRect.top : null;
            motionRef.current.freeTextPointerOffsetX = currentRect ? pointer.x - currentRect.left : null;
            freeTextActiveCategoryRef.current[product.id] = group;
            const rawProductMargin = Number(product.customMarginTop);
            const productMargin = getSafeFreeTextMargin(rawProductMargin, pageHeightPx);
            motionRef.current.freeTextDragSlot = {
                category: group,
                marginTop: productMargin,
            };
            initializeProductDragState(product.id, group, pointer);

            if (group.startsWith(FREE_TEXT_PREFIX)) {
                motionRef.current.vacatedFreeTextPosition = currentElement ? getCanvasSlot(currentElement, currentRect)?.position ?? null : null;
                const currentPositions = { ...(style.categoryPositions || {}) };
                setLiveCategoryPositions(currentPositions);
                liveCategoryPositionsRef.current = currentPositions;
            }

            const categoryElement = group.startsWith(FREE_TEXT_PREFIX)
                ? null
                : getRenderedDragElement('category', group);
            const categoryRect = categoryElement?.getBoundingClientRect();
            const pageElement = currentElement?.closest<HTMLElement>('[data-drag-page-container="category"]');
            const pageRect = pageElement?.getBoundingClientRect();
            const scale = pageRect && pageRect.height > 0 ? pageRect.height / Math.max(1, pageElement?.offsetHeight || 1) : 1;
            const rawInitialMargin = currentRect && categoryRect
                ? Math.max(0, Math.round((currentRect.top - categoryRect.top) / Math.max(scale, 0.001)))
                : product.customMarginTop || 0;
            const initialMargin = getSafeFreeTextMargin(rawInitialMargin, pageHeightPx);

            if (group.startsWith(FREE_TEXT_PREFIX)) {
                ensureFreeTextCategoryDragState(product, pointer, group, 'before', initialMargin);
            }
        },
        [ensureFreeTextCategoryDragState, getRenderedDragElement, initializeProductDragState, pageHeightPx, style.categoryPositions]
    );

    const initializeDragItem = useCallback((item: NonNullable<DragItem>, pointer: PointerPosition) => {
        motionRef.current.lastPointer = pointer;
        motionRef.current.dragStartPointer = pointer;
        if (item.type === 'category') {
            initializeCategoryDragState(item.id, pointer);
        } else if (item.type === 'product') {
            const product = products.find(candidate => candidate.id === item.id);
            if (product?.isFreeText) {
                initializeFreeTextDragState(product, item.group || product.category || `${FREE_TEXT_PREFIX}${item.id}`, pointer);
            } else {
                initializeProductDragState(item.id, item.group, pointer);
            }
        }
    }, [initializeCategoryDragState, initializeFreeTextDragState, initializeProductDragState, products]);

    const activateDrag = useCallback(
        (pending: PendingDrag, pointer: { x: number; y: number }) => {
            const draggedProduct = pending.type === 'product' ? products.find((product) => product.id === pending.id) : null;

            try {
                if (isDraggingRef.current) return;

                clearPendingActivation();
                applyBodyDragStyles();
                lockScrollableAncestors(pending.element);
                keepScrollLocked();
                attachNativeTouchBlocker();

                try {
                    const captureElement = pending.element.closest<HTMLElement>('[data-automenu-editor-canvas="true"], [data-product-designer-scroll-container="true"]')
                        || pending.element;
                    captureElement.setPointerCapture(pending.pointerId);
                    pointerCaptureRef.current = { element: captureElement, pointerId: pending.pointerId };
                } catch {
                    // Some browsers may reject capture if the pointer was already cancelled.
                }

                const newItem = { type: pending.type, id: pending.id, group: pending.group };
                if (
                    pending.pointerType === 'touch'
                    && pending.type === 'category'
                    && pending.element.dataset.dragContext === 'product-designer'
                    && typeof document !== 'undefined'
                ) {
                    document.body.dataset.automenuSuppressProductOptionsUntil = String(Date.now() + 10000);
                }
                isDraggingRef.current = true;
                hasDragMutationRef.current = false;
                const selection = pending.canvasSelection;
                if (selection && isDraggableSelectionItem(selection.source)) {
                    activeSelectionCanvasRef.current = selection.canvas;
                    if (selection.clear) collapseSelection?.(selection.source.type, selection.source.id);
                    if (selection.items.length > 1 || pending.type === 'addedImage') {
                        const pressed = pending.element.getBoundingClientRect();
                        const relativeX = (pointer.x - pressed.left) / Math.max(1, pressed.width);
                        const relativeY = (pointer.y - pressed.top) / Math.max(1, pressed.height);
                        const members: SelectionDragMember[] = [];
                        const selected = [selection.source, ...selection.items.filter(item => item !== selection.source)];
                        for (const item of selected) {
                            const primary = item === selection.source;
                            const image = item.type === 'addedImage';
                            const type = item.type === 'freeText' ? 'product' : item.type;
                            const element = primary ? pending.element : image
                                ? selection.canvas.querySelector<HTMLElement>(`[data-added-image-id="${escapeSelectorValue(item.id)}"]`)
                                : getRenderedDragElement(type, item.id);
                            if (!element) continue;
                            const grip = item.type === 'category' ? element.querySelector('[data-category-id]') || element : element;
                            const rect = grip.getBoundingClientRect();
                            const start = primary ? pointer : { x: rect.left + rect.width * relativeX, y: rect.top + rect.height * relativeY };
                            const dragItem = primary ? newItem : { type, id: item.id, group: element.dataset.dragGroup };
                            const motion = createDragMotion();
                            const member: SelectionDragMember = { item: dragItem, start, motion };
                            members.push(member);
                            const backgroundText = item.type === 'freeText' && Boolean(style.freeTextBackgrounds?.[item.id]);
                            if (image || backgroundText) {
                                const page = element.closest<HTMLElement>('[data-menu-print-page]');
                                const scale = page ? page.getBoundingClientRect().width / Math.max(1, page.offsetWidth) : 1;
                                member.layer = { ...captureImageDrag(item.id, Number(page?.dataset.pageIndex || 0), rect, start, scale || 1), backgroundText };
                            }
                        }
                        selectionDragRef.current = {
                            canvas: selection.canvas, start: pointer, pointer, members,
                            productIds: new Set(selected.filter(item => item.type === 'product').map(item => item.id)),
                            freeTextIds: new Set(selected.filter(item => item.type === 'freeText').map(item => item.id)),
                            categoryIds: new Set(selected.filter(item => item.type === 'category').map(item => item.id)),
                        };
                        selection.canvas.dataset.canvasSelectionDragging = 'true';
                        setDraggedSelection(selected);
                        for (const member of members) {
                            if (member.layer) continue;
                            draggedItemRef.current = member.item;
                            motionRef.current = member.motion;
                            initializeDragItem(member.item, member.start);
                            member.item = draggedItemRef.current || member.item;
                        }
                        motionRef.current = members[0]?.motion || motionRef.current;
                        draggedItemRef.current = members[0]?.item || newItem;
                    }
                    window.dispatchEvent(new CustomEvent('automenu:canvas-drag-move'));
                }
                const primary = selectionDragRef.current?.members[0]?.item || newItem;
                setDraggedItem(primary);
                draggedItemRef.current = primary;
                activePointerRef.current = { pointerId: pending.pointerId, pointerType: pending.pointerType, freeText: !selectionDragRef.current && Boolean(draggedProduct?.isFreeText) };
                motionRef.current.lastPointer = { x: pointer.x, y: pointer.y };
                motionRef.current.dragStartPointer = { x: pointer.x, y: pointer.y };
                dragSourceContextRef.current = pending.element.dataset.dragContext || null;
                productDesignerScrollContainerRef.current = pending.element.closest<HTMLElement>('[data-product-designer-scroll-container="true"]');
                if (selectionDragRef.current) return;
                if (!selection) handleSelection(pending.type === 'product' && draggedProduct?.isFreeText ? 'freeText' : pending.type, pending.id);

                initializeDragItem(newItem, pointer);
            } catch (error) {
                if (draggedProduct?.isFreeText) {
                    reportFreeTextDragError('activate-drag', error, { pointer, productId: pending.id, group: pending.group });
                }
                cancelAndCleanup();
            }
        },
        [applyBodyDragStyles, attachNativeTouchBlocker, cancelAndCleanup, clearPendingActivation, collapseSelection, getRenderedDragElement, handleSelection, initializeDragItem, keepScrollLocked, lockScrollableAncestors, products, reportFreeTextDragError, style.freeTextBackgrounds]
    );

    const reorderDraggedItem = useCallback(
        (pointer: { x: number; y: number }) => {
            try {
            const currentDragItem = draggedItemRef.current;
            const previousPointer = motionRef.current.lastPointer;
            if (!currentDragItem || !previousPointer) {
                motionRef.current.lastPointer = pointer;
                return;
            }

            const dragStart = motionRef.current.dragStartPointer;
            if (
                activePointerRef.current?.pointerType === 'touch'
                && dragSourceContextRef.current !== 'product-designer'
                && dragStart
                && Math.hypot(pointer.x - dragStart.x, pointer.y - dragStart.y) >= 6
                && typeof window !== 'undefined'
            ) {
                window.dispatchEvent(new CustomEvent('automenu:canvas-drag-move'));
            }

            scheduleProductDesignerAutoScroll(pointer);

            const categorySwapRebase = motionRef.current.categorySwapRebase;
            if (currentDragItem.type === 'category' && categorySwapRebase?.sourceId === currentDragItem.id) {
                categorySwapRebase.pointer = pointer;
                motionRef.current.lastPointer = pointer;
                return;
            }

            const swapRebase = motionRef.current.freeTextSwapRebase;
            if (swapRebase?.sourceId === currentDragItem.id) {
                swapRebase.pointer = pointer;
                motionRef.current.lastPointer = pointer;
                return;
            }

            const deltaX = pointer.x - previousPointer.x;
            const deltaY = pointer.y - previousPointer.y;
            if (!selectionDragRef.current && Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
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

                    const exchangeLock = motionRef.current.categoryFreeTextSwap;
                    if (exchangeLock && (Math.hypot(pointer.x - exchangeLock.x, pointer.y - exchangeLock.y) <= 8
                        || (pointer.x >= exchangeLock.rect.left - 12 && pointer.x <= exchangeLock.rect.right + 12
                            && pointer.y >= exchangeLock.rect.top - 8 && pointer.y <= exchangeLock.rect.bottom + 8))) {
                        motionRef.current.lastPointer = pointer;
                        return;
                    }
                    if (categoryElement && categoryRect && currentRect && deltaY) {
                        const header = categoryElement.querySelector('[data-category-id]')?.getBoundingClientRect() || categoryRect;
                        const line = deltaY < 0 ? header.top + header.height / 2 : categoryRect.bottom;
                        const crossedEdge = deltaY < 0
                            ? previousPointer.y >= line && pointer.y <= line
                            : previousPointer.y <= line && pointer.y >= line;
                        const atColumn = pointer.x >= categoryRect.left - 8 && pointer.x <= categoryRect.right + 8;
                        const slot = crossedEdge && atColumn ? getCanvasSlot(categoryElement, categoryRect) : null;
                        if (slot) {
                            const before = deltaY < 0;
                            const { page, pageRect, scale, position } = slot;
                            const columnRect = categoryElement.parentElement?.getBoundingClientRect() || pageRect;
                            const textHeight = currentRect.height;
                            const freeGap = 8 * scale;
                            const candidate = categoryRect.top - textHeight - freeGap;
                            const safeBefore = before && candidate >= columnRect.top ? getCollisionSafeFreeTextTop({
                                root: page, desiredTop: candidate, pointerY: candidate, height: textHeight,
                                minTop: columnRect.top, maxBottom: categoryRect.top - freeGap,
                                minLeft: currentRect.left, maxRight: currentRect.right,
                                excludeProductId: activeProduct.id, excludeCategoryId: currentCategory,
                            }) : null;
                            const clientTop = before ? safeBefore ?? categoryRect.top
                                : Math.min(categoryRect.bottom + freeGap, pageRect.bottom - textHeight);
                            const textPosition = {
                                ...position, y: (clientTop - pageRect.top) / scale,
                                pageX: Math.max(0, (currentRect.left - pageRect.left) / scale),
                            };
                            let freeTextCategory = currentCategory;
                            flushSync(() => {
                                freeTextCategory = ensureFreeTextCategoryDragState(activeProduct, pointer, currentCategory, before ? 'before' : 'after', 0);
                                const positions = { ...(liveCategoryPositionsRef.current || style.categoryPositions), [freeTextCategory]: textPosition };
                                if (before && safeBefore === null) {
                                    positions[currentCategory] = { ...position, y: position.y + (textHeight + freeGap) / scale };
                                }
                                liveCategoryPositionsRef.current = positions;
                                setLiveCategoryPositions(positions);
                                initializeLiveCategoryPageAssignments({
                                    ...liveCategoryPageAssignmentsRef.current,
                                    [freeTextCategory]: { pageIndex: position.pageIndex, columnIndex: position.columnIndex },
                                });
                            });
                            motionRef.current.categoryFreeTextSwap = {
                                id: currentCategory, rect: before ? header : new DOMRect(categoryRect.left, line - 4, categoryRect.width, 8),
                                ...pointer, direction: Math.sign(deltaY),
                            };
                            motionRef.current.vacatedFreeTextPosition = textPosition;
                            rebaseFreeTextAfterSwap({ sourceId: currentDragItem.id, sourceCategory: freeTextCategory, pointer });
                            motionRef.current.lastPointer = pointer;
                            return;
                        }
                    }

                    if (isGhostFreeText && currentElement && deltaY) {
                        const textElement = getRenderedDragElement('category', currentCategory);
                        const candidate = getOrderedCategoryTargets()
                            .filter(target => !target.id.startsWith(FREE_TEXT_PREFIX) && !isSelectedCategoryTarget(target.id))
                            .map(target => ({ target, header: target.element.querySelector('[data-category-id]')?.getBoundingClientRect() }))
                            .find(({ target, header }) => header
                                && (target.id !== exchangeLock?.id || (Math.sign(pointer.y - exchangeLock.y) !== exchangeLock.direction
                                    && Math.abs(pointer.y - exchangeLock.y) > 8))
                                && crossesTarget(previousPointer, pointer, header));
                        if (textElement && candidate?.header) {
                            const swapped = swapCategoryWithFreeText(candidate.target.element, textElement, null, motionRef.current.vacatedFreeTextPosition);
                            if (swapped) {
                                motionRef.current.categoryFreeTextSwap = { id: candidate.target.id, rect: candidate.header, ...pointer, direction: Math.sign(deltaY) };
                                motionRef.current.vacatedFreeTextPosition = swapped.text;
                                rebaseFreeTextAfterSwap({ sourceId: currentDragItem.id, sourceCategory: currentCategory, pointer });
                                motionRef.current.lastPointer = pointer;
                                return;
                            }
                        }
                    }

                    const swapPointerOffset = motionRef.current.freeTextPointerOffsetY;
                    const projectedFreeTextTop = currentRect && swapPointerOffset !== null
                        ? pointer.y - swapPointerOffset
                        : currentRect?.top ?? pointer.y;
                    const swapDirection = deltaY > 0 ? 'down' : deltaY < 0 ? 'up' : null;
                    const swapLock = motionRef.current.freeTextSwapLock;
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
                            motionRef.current.freeTextSwapLock = null;
                        }
                    }

                    const horizontalDirection = Math.abs(deltaX) > Math.abs(deltaY)
                        ? (deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null)
                        : null;
                    const projectedPointerOffsetX = motionRef.current.freeTextPointerOffsetX;
                    const projectedFreeTextLeft = currentRect && projectedPointerOffsetX !== null
                        ? pointer.x - projectedPointerOffsetX
                        : currentRect?.left ?? pointer.x;
                    const horizontalSwapTarget = currentRect && horizontalDirection
                        ? getHorizontalFreeTextSwapTarget({
                            productId: currentDragItem.id,
                            sourceRect: currentRect,
                            projectedLeft: projectedFreeTextLeft,
                            direction: horizontalDirection,
                        })
                        : null;
                    if (horizontalSwapTarget?.shouldSwap) {
                        const activeLock = motionRef.current.freeTextSwapLock;
                        const isLockedOnTarget = activeLock?.sourceId === currentDragItem.id
                            && activeLock.targetId === horizontalSwapTarget.product.id;
                        if (!isLockedOnTarget) {
                            let collisionResult = { moved: false, shouldLock: false };
                            flushSync(() => {
                                collisionResult = swapDraggedFreeTextWithTarget(activeProduct, horizontalSwapTarget.product);
                            });
                            if (collisionResult.moved) {
                                rebaseFreeTextAfterSwap({
                                    sourceId: currentDragItem.id,
                                    sourceCategory: freeTextActiveCategoryRef.current[currentDragItem.id] || currentCategory,
                                    pointer,
                                });
                                if (collisionResult.shouldLock) {
                                    motionRef.current.freeTextSwapLock = {
                                        sourceId: currentDragItem.id,
                                        targetId: horizontalSwapTarget.product.id,
                                    };
                                }
                                motionRef.current.lastPointer = pointer;
                                return;
                            }
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
                        const activeLock = motionRef.current.freeTextSwapLock;
                        const isLockedOnTarget = Boolean(
                            activeLock &&
                            activeLock.sourceId === currentDragItem.id &&
                            activeLock.targetId === targetProduct.id
                        );

                        if (!isLockedOnTarget) {
                            const sourcePageElement = currentElement?.closest<HTMLElement>(
                                '[data-drag-page-container="category"][data-drag-page-index]'
                            );
                            const sourcePageRect = sourcePageElement?.getBoundingClientRect();
                            const sourceScale = sourcePageRect && sourcePageRect.height > 0
                                ? sourcePageRect.height / Math.max(1, sourcePageElement?.offsetHeight || 1)
                                : 1;
                            const rawSourceMargin = Number(activeProduct.customMarginTop);
                            const sourceMargin = getSafeFreeTextMargin(rawSourceMargin, pageHeightPx);
                            const sourceNaturalTop = currentRect.top - (sourceMargin * sourceScale);
                            const rawContactMargin =
                                (freeTextSwapTarget.contactTop - sourceNaturalTop) / Math.max(sourceScale, 0.001);
                            motionRef.current.freeTextDragSlot = {
                                category: currentCategory,
                                marginTop: getSafeFreeTextMargin(rawContactMargin, pageHeightPx),
                            };

                            let collisionResult = { moved: false, shouldLock: false };
                            flushSync(() => {
                                collisionResult = swapDraggedFreeTextWithTarget(activeProduct, targetProduct);
                            });
                            if (collisionResult.moved) {
                                rebaseFreeTextAfterSwap({
                                    sourceId: currentDragItem.id,
                                    sourceCategory: freeTextActiveCategoryRef.current[currentDragItem.id] || currentCategory,
                                    pointer,
                                });
                                if (collisionResult.shouldLock) {
                                    motionRef.current.freeTextSwapLock = {
                                        sourceId: currentDragItem.id,
                                        targetId: targetProduct.id,
                                    };
                                }
                                motionRef.current.lastPointer = pointer;
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
                    const insertion = motionRef.current.freeTextInsertion;
                    if (insertion && pointer.x >= insertion.left && pointer.x < insertion.right
                        && pointer.y >= insertion.top && pointer.y < insertion.bottom) {
                        motionRef.current.lastPointer = pointer;
                        return;
                    }
                    motionRef.current.freeTextInsertion = null;
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
                                motionRef.current.freeTextInsertion = categoryTarget.targetRect || null;
                                rebaseFreeTextAfterSwap({
                                    sourceId: currentDragItem.id,
                                    sourceCategory: categoryTarget.category,
                                    pointer,
                                });
                                motionRef.current.lastPointer = pointer;
                                return;
                            }
                        }
                    }

                    if (!isGhostFreeText) {
                        setActiveProductGroup(activeProduct.id, currentCategory);
                        reorderProductByPointer(pointer, { x: deltaX, y: deltaY });
                        motionRef.current.lastPointer = pointer;
                        return;
                    }

                    const activeFreeTextCategory = ensureFreeTextCategoryDragState(
                        activeProduct,
                        pointer,
                        currentCategory,
                        'before',
                        0
                    );
                    if (activeFreeTextCategory !== currentCategory) {
                        rebaseFreeTextAfterSwap({
                            sourceId: currentDragItem.id,
                            sourceCategory: activeFreeTextCategory,
                            pointer,
                        });
                    }
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
                            motionRef.current.categoryActivePageIndex = pointerLane.pageIndex;
                            motionRef.current.categoryActiveLaneKey = pointerLane.key;
                            hasDragMutationRef.current = true;
                        }
                    }

                    const refreshedProduct = getLatestProductById(currentDragItem.id) || activeProduct;
                    const refreshedElement =
                        getRenderedDragElement('product', currentDragItem.id, activeFreeTextCategory) ||
                        getRenderedDragElement('product', currentDragItem.id) ||
                        currentElement;
                    const refreshedRect = refreshedElement?.getBoundingClientRect();
                    const pointerOffset = motionRef.current.freeTextPointerOffsetY ?? (
                        refreshedRect ? Math.max(0, Math.min(pointer.y - refreshedRect.top, refreshedRect.height)) : 0
                    );
                    motionRef.current.freeTextPointerOffsetY = pointerOffset;
                    const pointerOffsetX = motionRef.current.freeTextPointerOffsetX ?? (
                        refreshedRect ? Math.max(0, Math.min(pointer.x - refreshedRect.left, refreshedRect.width)) : 0
                    );
                    motionRef.current.freeTextPointerOffsetX = pointerOffsetX;
                    const rawCurrentMargin = Number(refreshedProduct.customMarginTop);
                    const currentMargin = getSafeFreeTextMargin(rawCurrentMargin, pageHeightPx);
                    const activePlacement = liveCategoryPageAssignmentsRef.current?.[activeFreeTextCategory];
                    const activeLaneKey = activePlacement
                        ? getCategoryLaneKey(String(activePlacement.pageIndex), String(activePlacement.columnIndex))
                        : motionRef.current.categoryActiveLaneKey;
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
                    const scale = pageRect && pageRect.height > 0 ? pageRect.height / Math.max(1, pageElement?.offsetHeight || 1) : 1;
                    const safeTop = pageRect?.top ?? refreshedRect?.top ?? pointer.y;
                    const safeBottom = pageRect?.bottom ?? Number.POSITIVE_INFINITY;
                    const desiredLeft = pageRect && refreshedRect
                        ? Math.max(pageRect.left, Math.min(pointer.x - pointerOffsetX, pageRect.right - refreshedRect.width))
                        : pointer.x;
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
                            minLeft: desiredLeft,
                            maxRight: desiredLeft + refreshedRect.width,
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
                    if (activeLane && pageRect && refreshedRect) {
                        if (safeClientTop === null) return;
                        const nextPosition: CategoryPosition = {
                            pageIndex: activeLane.pageIndex,
                            columnIndex: activeLane.columnIndex,
                            y: Math.max(0, Math.round((desiredTop - pageRect.top) / Math.max(scale, 0.001))),
                            pageX: Math.max(0, (desiredLeft - pageRect.left) / scale),
                        };
                        const currentPositions = liveCategoryPositionsRef.current || { ...(style.categoryPositions || {}) };
                        const previousPosition = currentPositions[activeFreeTextCategory];
                        if (
                            previousPosition?.pageIndex !== nextPosition.pageIndex
                            || previousPosition?.columnIndex !== nextPosition.columnIndex
                            || previousPosition?.y !== nextPosition.y
                            || previousPosition?.pageX !== nextPosition.pageX
                        ) {
                            const nextPositions = {
                                ...currentPositions,
                                [activeFreeTextCategory]: nextPosition,
                            };
                            liveCategoryPositionsRef.current = nextPositions;
                            setLiveCategoryPositions(nextPositions);
                            hasDragMutationRef.current = true;
                        }
                        motionRef.current.lastPointer = pointer;
                        return;
                    }
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
                    const desiredMargin = getSafeFreeTextMargin(rawDesiredMargin, pageHeightPx);

                    if (desiredMargin !== currentMargin) {
                        motionRef.current.freeTextDragSlot = {
                            category: activeFreeTextCategory,
                            marginTop: desiredMargin,
                        };
                        onUpdateProducts?.([{ id: activeProduct.id, field: 'customMarginTop', value: desiredMargin }]);
                        moveGroupedProductRef(refreshedProduct, activeFreeTextCategory, { customMarginTop: desiredMargin });
                        hasDragMutationRef.current = true;
                    }

                    motionRef.current.lastPointer = pointer;
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

            motionRef.current.lastPointer = pointer;
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
            getHorizontalFreeTextSwapTarget,
            getRenderedDragElement,
            getLatestProductById,
            getOrderedCategoryTargets,
            initializeLiveCategoryPageAssignments,
            isSelectedCategoryTarget,
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
            scheduleProductDesignerAutoScroll,
            setActiveProductGroup,
            swapDraggedFreeTextWithTarget,
            swapCategoryWithFreeText,
            syncFreeTextCategoryOrderToLane,
            style,
        ]
    );

    const handlePointerReorder = useCallback((pointer: PointerPosition) => {
        const selection = selectionDragRef.current;
        if (!selection) {
            reorderDraggedItem(pointer);
            return;
        }

        const stepX = pointer.x - selection.pointer.x;
        const stepY = pointer.y - selection.pointer.y;
        if (!stepX && !stepY) return;
        selection.pointer = pointer;
        const delta = { x: pointer.x - selection.start.x, y: pointer.y - selection.start.y };
        const moves: LayerDragMove[] = [];
        // Move the objects furthest along the gesture first so followers can occupy the slots they free.
        const ordered = [...selection.members].sort((a, b) =>
            (b.start.x - a.start.x) * stepX + (b.start.y - a.start.y) * stepY);
        for (const member of ordered) {
            const point = { x: member.start.x + delta.x, y: member.start.y + delta.y };
            if (member.layer) {
                moves.push({ drag: member.layer, point });
                continue;
            }
            motionRef.current = member.motion;
            draggedItemRef.current = member.item;
            flushSync(() => reorderDraggedItem(point));
            if (selectionDragRef.current !== selection) return;
            member.item = draggedItemRef.current || member.item;
        }
        const primary = selection.members[0];
        if (primary) {
            motionRef.current = primary.motion;
            draggedItemRef.current = primary.item;
        }
        if (moves.length) {
            const pages = getRenderedImageDragPages();
            selection.layers = moveDraggedLayers({ ...style, ...selection.layers }, moves, pages);
            setLiveCanvasLayers(selection.layers);
        }
    }, [reorderDraggedItem, style]);

    useEffect(() => {
        reorderAtPointerRef.current = handlePointerReorder;
    }, [handlePointerReorder]);

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
                    if (!pointerCaptureRef.current && !activePointer.freeText && Date.now() - lastNativeTouchMoveAtRef.current < 80) {
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
            const isCanvasTouch = pending.pointerType === 'touch'
                && pending.element.dataset.dragContext !== 'product-designer';
            if (pending.type === 'addedImage' || (isCanvasTouch && pending.longPressReady)) {
                if (traveledDistance < IMAGE_DRAG_THRESHOLD_PX) return;
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('automenu:canvas-drag-move'));
                activateDrag(pending, { x: pending.startX, y: pending.startY });
                handlePointerReorder({ x: event.clientX, y: event.clientY });
                return;
            }
            const isTwoColumnProductDesignerCategory = pending.pointerType === 'touch'
                && pending.type === 'category'
                && pending.element.dataset.dragContext === 'product-designer'
                && (style.categoryColumnCount || 1) === 2;
            const activationThreshold = pending.pointerType === 'touch'
                ? isTwoColumnProductDesignerCategory
                    ? TWO_COLUMN_CATEGORY_TOUCH_MOVE_CANCEL_THRESHOLD_PX
                    : TOUCH_MOVE_CANCEL_THRESHOLD_PX
                : POINTER_MOVE_THRESHOLD_PX;
            if (!pending.scrolling && traveledDistance < activationThreshold) return;

            if (pending.pointerType === 'touch') {
                if ((pending.freeText || pending.type === 'category') && isCanvasTouch) {
                    if (pending.activationTimeoutId !== null) {
                        window.clearTimeout(pending.activationTimeoutId);
                        pending.activationTimeoutId = null;
                    }
                    const canvas = pending.element.closest<HTMLElement>('[data-automenu-editor-canvas="true"]');
                    if (canvas) {
                        canvas.scrollLeft -= event.clientX - (pending.lastX ?? pending.startX);
                        canvas.scrollTop -= event.clientY - (pending.lastY ?? pending.startY);
                    }
                    pending.scrolling = true;
                    pending.lastX = event.clientX;
                    pending.lastY = event.clientY;
                    return;
                }
                if (isTwoColumnProductDesignerCategory) {
                    if (event.cancelable) event.preventDefault();
                    event.stopPropagation();
                    if (pending.activationTimeoutId !== null) {
                        window.clearTimeout(pending.activationTimeoutId);
                        pending.activationTimeoutId = null;
                    }
                    pending.scrolling = true;
                    const scrollContainer = pending.element.closest<HTMLElement>('[data-product-designer-scroll-container="true"]');
                    if (scrollContainer) {
                        const previousY = pending.lastY ?? pending.startY;
                        scrollContainer.scrollTop -= event.clientY - previousY;
                    }
                    pending.lastY = event.clientY;
                    return;
                }
                cancelAndCleanup();
                return;
            }

            activateDrag(pending, { x: pending.startX, y: pending.startY });
            handlePointerReorder({ x: event.clientX, y: event.clientY });
        },
        [activateDrag, cancelAndCleanup, clearTouchCancelCommit, handlePointerReorder, keepScrollLocked, style.categoryColumnCount]
    );

    const updateDragAtReleasePointer = useCallback((pointer: { x: number; y: number }) => {
        if (selectionDragRef.current) {
            handlePointerReorder(pointer);
            return;
        }
        const currentDragItem = draggedItemRef.current;
        if (currentDragItem?.type === 'product') {
            const draggedProduct = getLatestProductById(currentDragItem.id);
            if (draggedProduct?.isFreeText) {
                handlePointerReorder(pointer);
            } else {
                const previousPointer = motionRef.current.lastPointer || pointer;
                reorderProductByPointer(pointer, {
                    x: pointer.x - previousPointer.x,
                    y: pointer.y - previousPointer.y,
                });
                motionRef.current.lastPointer = pointer;
            }
            return;
        }

        if (currentDragItem?.type !== 'category') return;

        const previousPointer = motionRef.current.lastPointer;
        if (motionRef.current.categoryFreeTextSwap && previousPointer?.x === pointer.x && previousPointer.y === pointer.y) return;
        const pendingRebase = motionRef.current.categorySwapRebase;
        if (pendingRebase?.sourceId === currentDragItem.id) {
            pendingRebase.pointer = pointer;
            motionRef.current.lastPointer = pointer;
            return;
        }

        reorderCategoryByPointer(pointer, { commitImmediately: false });
        motionRef.current.lastPointer = pointer;
    }, [getLatestProductById, handlePointerReorder, reorderCategoryByPointer, reorderProductByPointer]);

    const handleGlobalPointerUp = useCallback(
        (event: PointerEvent) => {
            const activePointer = activePointerRef.current;
            if (activePointer && event.pointerId === activePointer.pointerId) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                updateDragAtReleasePointer({ x: event.clientX, y: event.clientY });
                performCommitAndCleanup();
                return;
            }

            const pending = pendingDragRef.current;
            if (pending && event.pointerId === pending.pointerId) {
                if (pending.type === 'addedImage' && !pending.longPressReady) handleSelection('addedImage', pending.id);
                cancelAndCleanup();
            }
        },
        [cancelAndCleanup, handleSelection, performCommitAndCleanup, updateDragAtReleasePointer]
    );

    const handleGlobalPointerCancel = useCallback(
        (event: PointerEvent) => {
            const activePointer = activePointerRef.current;
            if (activePointer && event.pointerId === activePointer.pointerId) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();

                if (activePointer.pointerType === 'touch' && !activePointer.freeText && isDraggingRef.current) {
                    keepScrollLocked();
                    scheduleTouchCancelCommit();
                    return;
                }

                updateDragAtReleasePointer({ x: event.clientX, y: event.clientY });
                performCommitAndCleanup();
                return;
            }

            const pending = pendingDragRef.current;
            if (pending && event.pointerId === pending.pointerId) {
                cancelAndCleanup();
            }
        },
        [cancelAndCleanup, keepScrollLocked, performCommitAndCleanup, scheduleTouchCancelCommit, updateDragAtReleasePointer]
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
            if (!isDraggingRef.current) return;

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
            // The captured pointer keeps tracking even if the original touch target moves in the DOM.
            if (pointerCaptureRef.current?.element.hasPointerCapture(activePointerRef.current?.pointerId ?? -1) || activePointerRef.current?.freeText) return;

            const touch = event.touches[0] || event.changedTouches[0];
            if (!touch) return;
            const pointer = { x: touch.clientX, y: touch.clientY };

            if (isDraggingRef.current && draggedItemRef.current) {
                handlePointerReorder(pointer);
            }
        };
    }, [cancelAndCleanup, clearTouchCancelCommit, handlePointerReorder, keepScrollLocked]);

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
                if (touch) updateDragAtReleasePointer({ x: touch.clientX, y: touch.clientY });
                performCommitAndCleanup();
                return;
            }

            if (pendingDragRef.current?.pointerType === 'touch') {
                cancelAndCleanup();
                return;
            }

            removeNativeTouchBlockerRef.current();
        };
    }, [cancelAndCleanup, clearTouchCancelCommit, performCommitAndCleanup, updateDragAtReleasePointer]);

    useEffect(() => {
        touchCancelHandlerRef.current = (event: TouchEvent) => {
            if (isDraggingRef.current && draggedItemRef.current) {
                if (event.cancelable) {
                    event.preventDefault();
                }
                event.stopPropagation();
                event.stopImmediatePropagation();
                keepScrollLocked();
                if (activePointerRef.current?.freeText) return;
                // A touch target can be removed during reordering while its pointer is still captured.
                scheduleTouchCancelCommit();
                return;
            }

            if (pendingDragRef.current?.pointerType === 'touch') {
                cancelAndCleanup();
                return;
            }

            removeNativeTouchBlockerRef.current();
        };
    }, [cancelAndCleanup, keepScrollLocked, scheduleTouchCancelCommit]);

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

    const cancelAndCleanupRef = useRef(cancelAndCleanup);
    useEffect(() => {
        cancelAndCleanupRef.current = cancelAndCleanup;
    }, [cancelAndCleanup]);
    useEffect(() => () => cancelAndCleanupRef.current(), []);

    const sortedCategories = useMemo(() => {
        const draggedProduct = draggedItem?.type === 'product'
            ? products.find((product) => product.id === draggedItem.id)
            : null;

        if (liveCategoryOrder && (draggedSelection.length || draggedItem?.type === 'category' || draggedProduct?.isFreeText)) {
            return liveCategoryOrder;
        }
        return sortedCategoriesBase;
    }, [draggedItem, draggedSelection.length, liveCategoryOrder, products, sortedCategoriesBase]);

    const groupedProducts = useMemo(() => {
        if ((!draggedSelection.length && draggedItem?.type !== 'product') || !liveProductOrder) {
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
    }, [draggedItem, draggedSelection.length, groupedProductsBase, liveProductOrder]);

    const handleDragStart = useCallback(
        (event: React.PointerEvent, type: DragType, id: string, group?: string) => {
            if (editingId || (type !== 'addedImage' && isInteractiveTarget(event.target))) return;
            if (event.shiftKey || event.ctrlKey || event.metaKey) return;
            if (event.button !== 0) return;

            const pointerType = event.pointerType || 'mouse';
            const draggedProduct = type === 'product' ? products.find((product) => product.id === id) : null;
            const sourceType = draggedProduct?.isFreeText ? 'freeText' : type;
            const element = event.currentTarget as HTMLElement;
            const canvas = element.closest<HTMLElement>('[data-automenu-editor-canvas="true"]');
            const items = getDraggableSelection(selectedItems);
            const source = items.find(item => item.type === sourceType && item.id === id);
            let canvasSelection: PendingDrag['canvasSelection'];
            if (canvas && source && (multiSelectMode || items.length > 1)) {
                const productCategories = new Set(products.filter(product =>
                    !product.isFreeText && items.some(item => item.type === 'product' && item.id === product.id)
                ).map(product => product.category));
                const clear = productCategories.size > 1;
                canvasSelection = { canvas, source, items: clear ? [source] : items, clear };
            }
            if (!canvasSelection && (multiSelectMode || type === 'addedImage')) return;

            event.stopPropagation();

            if (isDraggingRef.current || activePointerRef.current) {
                cancelAndCleanup();
            } else {
                clearPendingActivation();
            }
            attachGlobalListeners();

            const pending: PendingDrag = {
                type,
                id,
                group,
                element,
                pointerId: event.pointerId,
                pointerType,
                startX: event.clientX,
                startY: event.clientY,
                activationTimeoutId: null,
                freeText: draggedProduct?.isFreeText,
                canvasSelection,
            };

            if (pending.pointerType === 'touch') {
                pending.activationTimeoutId = window.setTimeout(() => {
                    if (!pendingDragRef.current || pendingDragRef.current.pointerId !== pending.pointerId) return;
                    if (pending.element.dataset.dragContext !== 'product-designer') {
                        pending.longPressReady = true;
                        pending.activationTimeoutId = null;
                        if (pending.canvasSelection) return;
                        handleSelection(sourceType, pending.id);
                        window.dispatchEvent(new CustomEvent('automenu:canvas-drag-ready', {
                            detail: {
                                type: pending.type === 'product' && draggedProduct?.isFreeText ? 'freeText' : pending.type,
                                id: pending.id,
                                x: pending.startX,
                                y: pending.startY,
                            },
                        }));
                        return;
                    }
                    activateDrag(pending, { x: pending.startX, y: pending.startY });
                }, TOUCH_LONG_PRESS_MS);
            }

            pendingDragRef.current = pending;

            if (pointerType !== 'touch' && !canvasSelection) {
                handleSelection(sourceType, id);
            }
        },
        [activateDrag, attachGlobalListeners, cancelAndCleanup, clearPendingActivation, editingId, handleSelection, multiSelectMode, products, selectedItems]
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
            motionRef.current.lastPointer = pointer;
            motionRef.current.dragStartPointer = pointer;
            dragSourceContextRef.current = event.currentTarget.dataset.dragContext || null;
            productDesignerScrollContainerRef.current = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-product-designer-scroll-container="true"]');

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
                updateDragAtReleasePointer({ x: event.clientX, y: event.clientY });
            }
            performCommitAndCleanup();
        },
        [performCommitAndCleanup, updateDragAtReleasePointer]
    );

    return {
        dragScope,
        draggedItem,
        draggedSelection,
        liveCategoryOrder,
        liveCategoryPageAssignments,
        liveCategoryPositions,
        liveProductOrder,
        liveCanvasLayers,
        sortedCategories,
        groupedProducts,
        handleDragStart,
        handleDragEnd: performCommitAndCleanup,
        handleNativeDragStart,
        handleNativeDragEnd,
        handleDragOverItem: handleNativeDragOverItem,
    };
};
