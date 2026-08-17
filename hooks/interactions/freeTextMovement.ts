import { Product, MenuStyle } from '../../types';
import { FREE_TEXT_PREFIX, NUDGE_STEP, STANDARD_GAP, InteractionProps } from './types';
import { A4_HEIGHT_PX as MENU_PAGE_HEIGHT_PX, SAFETY_BUFFER } from '../../utils/menuPagination';

type FreeTextVisualItem =
    | { type: 'category'; id: string; category: string }
    | { type: 'product'; id: string; category: string; product: Product };

export interface RenderedFreeTextTarget {
    product: Product;
    rect: DOMRect;
}

export interface FreeTextMoveContext {
    products: Product[];
    sortedCategories: string[];
    groupedProducts: Record<string, Product[]>;
    onUpdateProduct?: InteractionProps['onUpdateProduct'];
    onUpdateProducts?: InteractionProps['onUpdateProducts'];
    onStyleUpdate?: InteractionProps['onStyleUpdate'];
    style?: MenuStyle;
}

const createFreeTextGhostCategory = () => {
    const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    return `${FREE_TEXT_PREFIX}${randomId}`;
};

const FREE_TEXT_SURFACE_TOLERANCE = 0.5;

const getSafeMarginTop = (value: number | undefined) => {
    const margin = Number(value);
    return Number.isFinite(margin) ? Math.max(0, Math.round(margin)) : 0;
};

const getRenderedMenuElementById = (elementId: string) => {
    if (typeof document === 'undefined') return null;
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(elementId)
        : elementId.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    return document.querySelector<HTMLElement>(
        `[data-menu-print-page="true"] #${escapedId}`
    );
};

export const getCollisionSafeFreeTextTop = ({
    root,
    desiredTop,
    height,
    pointerY,
    excludeProductId,
    excludeProductIds = [],
    minTop = Number.NEGATIVE_INFINITY,
    maxBottom = Number.POSITIVE_INFINITY,
    minLeft = Number.NEGATIVE_INFINITY,
    maxRight = Number.POSITIVE_INFINITY,
    gap = 6,
}: {
    root: ParentNode;
    desiredTop: number;
    height: number;
    pointerY: number;
    excludeProductId?: string;
    excludeProductIds?: string[];
    minTop?: number;
    maxBottom?: number;
    minLeft?: number;
    maxRight?: number;
    gap?: number;
}) => {
    const clampTop = (top: number) => Math.max(minTop, Math.min(top, maxBottom - height));
    const excludedProductElementIds = new Set([
        ...(excludeProductId ? [`product-container-${excludeProductId}`] : []),
        ...excludeProductIds.map((productId) => `product-container-${productId}`),
    ]);
    const objects = Array.from(root.querySelectorAll<HTMLElement>(
        '[id^="product-container-"], [id^="category-header-"], #menu-title-text, #menu-subtitle-text, [data-added-image-drag="true"]'
    ))
        .filter((element) => (
            element.isConnected &&
            element.getClientRects().length > 0 &&
            !excludedProductElementIds.has(element.id)
        ))
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.right > minLeft && rect.left < maxRight)
        .sort((left, right) => left.top - right.top || left.left - right.left);

    const overlaps = (top: number, rect: DOMRect) => (
        top < rect.bottom + gap && top + height > rect.top - gap
    );
    const boundedDesiredTop = clampTop(desiredTop);
    const collision = objects.find((rect) => overlaps(boundedDesiredTop, rect));
    if (!collision) return boundedDesiredTop;

    const preferredCandidate = pointerY <= collision.top + (collision.height / 2)
        ? collision.top - height - gap
        : collision.bottom + gap;
    const candidates = [
        preferredCandidate,
        collision.top - height - gap,
        collision.bottom + gap,
        minTop,
        maxBottom - height,
        ...objects.flatMap((rect) => [rect.top - height - gap, rect.bottom + gap]),
    ]
        .map(clampTop)
        .filter(Number.isFinite)
        .filter((top, index, list) => list.indexOf(top) === index)
        .filter((top) => objects.every((rect) => !overlaps(top, rect)));

    if (candidates.length === 0) return null;
    if (candidates.includes(clampTop(preferredCandidate))) return clampTop(preferredCandidate);

    return candidates.reduce((best, candidate) => (
        Math.abs(candidate - boundedDesiredTop) < Math.abs(best - boundedDesiredTop) ? candidate : best
    ));
};

export const getFreeTextPageOverflow = (
    productId: string,
    style?: Pick<MenuStyle, 'pagePadding'>,
    marginDelta: number = 0
) => {
    if (typeof document === 'undefined') return null;

    const element = getRenderedMenuElementById(`product-container-${productId}`);
    const pageElement = element?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
    if (!element || !pageElement) return null;

    const pageRect = pageElement.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const scale = pageRect.height > 0 ? pageRect.height / MENU_PAGE_HEIGHT_PX : 1;
    const pagePadding = style?.pagePadding || 48;
    const safeBottom = pageRect.top + ((MENU_PAGE_HEIGHT_PX - pagePadding - SAFETY_BUFFER) * scale);
    const projectedBottom = rect.bottom + (marginDelta * scale);
    const columnElement = element.closest<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]');

    return {
        shouldAdvance: projectedBottom > safeBottom,
        overflowPx: Math.max(0, (projectedBottom - safeBottom) / Math.max(scale, 0.001)),
        pageIndex: Number(pageElement.dataset.pageIndex ?? 0),
        columnIndex: Number(columnElement?.dataset.dragColumnIndex ?? 0),
    };
};

const buildFreeTextVisualList = (
    sortedCategories: string[],
    groupedProducts: Record<string, Product[]>
): FreeTextVisualItem[] => {
    const list: FreeTextVisualItem[] = [];

    sortedCategories.forEach((category) => {
        if (!category.startsWith(FREE_TEXT_PREFIX)) {
            list.push({ type: 'category', id: category, category });
        }

        (groupedProducts[category] || [])
            .forEach((product) => {
                list.push({ type: 'product', id: product.id, category, product });
            });
    });

    return list;
};

const uniqueOrder = (ids: string[]) => {
    const seen = new Set<string>();
    return ids.filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};

const getCurrentProductOrder = (
    category: string,
    groupedProducts: Record<string, Product[]>,
    customOrder?: string[]
) => uniqueOrder([...(customOrder || []), ...((groupedProducts[category] || []).map((product) => product.id))]);

const replaceInOrder = (order: string[], fromId: string, toId: string) => {
    const nextOrder = order.map((itemId) => itemId === fromId ? toId : itemId);
    if (!nextOrder.includes(toId)) nextOrder.push(toId);
    return uniqueOrder(nextOrder.filter((itemId) => itemId !== fromId || fromId === toId));
};

const getCategoryOrder = (currentOrder: string[] | undefined, sortedCategories: string[]) => {
    const nextOrder = [...(currentOrder && currentOrder.length > 0 ? currentOrder : sortedCategories)];
    sortedCategories.forEach((category) => {
        if (!nextOrder.includes(category)) nextOrder.push(category);
    });
    return nextOrder;
};

const getVisualElement = (item: FreeTextVisualItem) => {
    return getRenderedMenuElementById(
        item.type === 'category'
            ? `category-header-${item.id}`
            : `product-container-${item.id}`
    );
};

const getRenderedLayoutScale = (element: HTMLElement) => {
    const pageElement = element.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
    const pageRect = pageElement?.getBoundingClientRect();
    return pageRect && pageRect.height > 0
        ? pageRect.height / MENU_PAGE_HEIGHT_PX
        : 1;
};

export const getVerticalGapBetweenRects = (
    currentRect: DOMRect,
    neighborRect: DOMRect,
    direction: 'up' | 'down'
) => (
    direction === 'down'
        ? neighborRect.top - currentRect.bottom
        : currentRect.top - neighborRect.bottom
);

export const getNearestRenderedFreeTextTarget = (
    sourceRect: DOMRect,
    targets: RenderedFreeTextTarget[],
    direction: 'up' | 'down'
) => targets
    .filter((target) => (
        target.rect.right > sourceRect.left &&
        target.rect.left < sourceRect.right
    ))
    .filter((target) => (
        direction === 'down'
            ? target.rect.bottom > sourceRect.top
            : target.rect.top < sourceRect.bottom
    ))
    .sort((left, right) => (
        direction === 'down'
            ? left.rect.top - right.rect.top
            : right.rect.bottom - left.rect.bottom
    ))[0] || null;

const getVerticalGap = (
    productId: string,
    neighbor: FreeTextVisualItem,
    direction: 'up' | 'down'
) => {
    if (typeof document === 'undefined') return null;

    const currentElement = getRenderedMenuElementById(`product-container-${productId}`);
    const neighborElement = getVisualElement(neighbor);
    if (!currentElement || !neighborElement) return null;

    const currentRect = currentElement.getBoundingClientRect();
    const neighborRect = neighborElement.getBoundingClientRect();
    const scale = getRenderedLayoutScale(currentElement);

    return getVerticalGapBetweenRects(currentRect, neighborRect, direction) / Math.max(scale, 0.001);
};

const getNearestRenderedFreeText = (
    context: FreeTextMoveContext,
    productId: string,
    direction: 'up' | 'down'
) => {
    if (typeof document === 'undefined') return null;

    const currentElement = getRenderedMenuElementById(`product-container-${productId}`);
    if (!currentElement) return null;

    const sourceRect = currentElement.getBoundingClientRect();
    const targets = context.products
        .filter((candidate) => candidate.isFreeText && candidate.id !== productId)
        .map((candidate) => {
            const element = getRenderedMenuElementById(`product-container-${candidate.id}`);
            return element
                ? { product: candidate, rect: element.getBoundingClientRect() }
                : null;
        })
        .filter((target): target is RenderedFreeTextTarget => Boolean(target));
    const target = getNearestRenderedFreeTextTarget(sourceRect, targets, direction);
    if (!target) return null;

    const scale = getRenderedLayoutScale(currentElement);
    return {
        ...target,
        gap: getVerticalGapBetweenRects(sourceRect, target.rect, direction) / Math.max(scale, 0.001),
    };
};

const getFreeTextSurfaceGap = (
    productId: string,
    direction: 'up' | 'down'
) => {
    if (typeof document === 'undefined') return null;

    const currentElement = getRenderedMenuElementById(`product-container-${productId}`);
    const pageElement = currentElement?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
    const columnElement = currentElement?.closest<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]');
    if (!currentElement || !pageElement) return null;

    const currentRect = currentElement.getBoundingClientRect();
    const columnRect = columnElement?.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const scale = getRenderedLayoutScale(currentElement);
    const horizontalLeft = columnRect?.left ?? currentRect.left;
    const horizontalRight = columnRect?.right ?? currentRect.right;
    const pagePadding = 48 * scale;
    const boundary = direction === 'up'
        ? (columnRect?.top ?? pageRect.top + pagePadding)
        : (columnRect?.bottom ?? pageRect.bottom - pagePadding);
    const surfaces = Array.from(pageElement.querySelectorAll<HTMLElement>(
        '[id^="product-container-"], [id^="category-header-"], #menu-title-text, #menu-subtitle-text, [data-added-image-drag="true"]'
    ))
        .filter((element) => (
            element !== currentElement &&
            element.isConnected &&
            element.getClientRects().length > 0
        ))
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => (
            rect.right > horizontalLeft &&
            rect.left < horizontalRight
        ));

    const nearestEdge = direction === 'up'
        ? surfaces
            .filter((rect) => rect.top < currentRect.top)
            .reduce((bottom, rect) => Math.max(bottom, rect.bottom), boundary)
        : surfaces
            .filter((rect) => rect.bottom > currentRect.bottom)
            .reduce((top, rect) => Math.min(top, rect.top), boundary);
    const gap = direction === 'up'
        ? currentRect.top - nearestEdge
        : nearestEdge - currentRect.bottom;

    return gap / Math.max(scale, 0.001);
};

const moveToGhostSlot = (
    context: FreeTextMoveContext,
    product: Product,
    anchorCategory: string,
    position: 'before' | 'after',
    marginTop: number
) => {
    const ghostCategory = createFreeTextGhostCategory();
    const safeMarginTop = getSafeMarginTop(marginTop);

    context.onUpdateProducts?.([
        { id: product.id, field: 'category', value: ghostCategory },
        { id: product.id, field: 'customMarginTop', value: safeMarginTop },
    ]);

    context.onStyleUpdate?.((prev) => {
        const categoryOrder = getCategoryOrder(prev.customCategoryOrder, context.sortedCategories);
        const anchorIndex = categoryOrder.indexOf(anchorCategory);
        const insertIndex = anchorIndex === -1
            ? categoryOrder.length
            : position === 'before'
                ? anchorIndex
                : anchorIndex + 1;

        categoryOrder.splice(insertIndex, 0, ghostCategory);

        const productOrder = { ...(prev.customProductOrder || {}) };
        Object.keys(productOrder).forEach((category) => {
            productOrder[category] = productOrder[category].filter((id) => id !== product.id);
        });
        productOrder[ghostCategory] = [product.id];

        return {
            ...prev,
            customCategoryOrder: uniqueOrder(categoryOrder),
            customProductOrder: productOrder,
            name: 'Custom',
        };
    });

    return ghostCategory;
};

export const moveFreeTextToGhostSlot = (
    context: FreeTextMoveContext,
    product: Product,
    anchorCategory: string,
    position: 'before' | 'after',
    marginTop: number
) => moveToGhostSlot(context, product, anchorCategory, position, marginTop);

export const moveFreeTextToNextPage = (
    context: FreeTextMoveContext,
    product: Product,
    marginTop: number = 0
) => {
    let targetCategory = product.category || '';

    if (!targetCategory.startsWith(FREE_TEXT_PREFIX)) {
        targetCategory = moveToGhostSlot(context, product, product.category || targetCategory, 'after', marginTop);
    } else {
        context.onUpdateProduct?.(product.id, 'customMarginTop', getSafeMarginTop(marginTop));
    }

    context.onStyleUpdate?.((prev) => {
        const categoryOrder = getCategoryOrder(prev.customCategoryOrder, context.sortedCategories);
        if (!categoryOrder.includes(targetCategory)) categoryOrder.push(targetCategory);

        return {
            ...prev,
            customCategoryOrder: uniqueOrder(categoryOrder),
            pageBreaks: uniqueOrder([...(prev.pageBreaks || []), targetCategory]),
            name: 'Custom',
        };
    });

    return targetCategory;
};

export type FreeTextCategoryPlacement =
    | { type: 'edge'; edge: 'start' | 'end' }
    | { type: 'product'; productId: string; position: 'before' | 'after' };

export const placeFreeTextInCategory = (
    context: FreeTextMoveContext,
    product: Product,
    targetCategory: string,
    placement: FreeTextCategoryPlacement
) => {
    const sourceCategory = product.category || '';

    context.onUpdateProducts?.([
        { id: product.id, field: 'category', value: targetCategory },
        { id: product.id, field: 'customMarginTop', value: 0 },
    ]);

    context.onStyleUpdate?.((prev) => {
        const productOrder = { ...(prev.customProductOrder || {}) };
        Object.keys(productOrder).forEach((category) => {
            productOrder[category] = productOrder[category].filter((id) => id !== product.id);
        });

        const baseOrder = getCurrentProductOrder(targetCategory, context.groupedProducts, productOrder[targetCategory])
            .filter((id) => id !== product.id);
        let insertionIndex = placement.type === 'edge'
            ? (placement.edge === 'start' ? 0 : baseOrder.length)
            : baseOrder.indexOf(placement.productId);

        if (placement.type === 'product') {
            insertionIndex = insertionIndex === -1
                ? baseOrder.length
                : insertionIndex + (placement.position === 'after' ? 1 : 0);
        }

        baseOrder.splice(Math.max(0, Math.min(insertionIndex, baseOrder.length)), 0, product.id);
        productOrder[targetCategory] = uniqueOrder(baseOrder);

        const sourceWasGhost = sourceCategory.startsWith(FREE_TEXT_PREFIX) && sourceCategory !== targetCategory;
        if (sourceWasGhost) delete productOrder[sourceCategory];

        return {
            ...prev,
            customCategoryOrder: sourceWasGhost
                ? (prev.customCategoryOrder || []).filter((category) => category !== sourceCategory)
                : prev.customCategoryOrder,
            customProductOrder: productOrder,
            pageBreaks: sourceWasGhost
                ? (prev.pageBreaks || []).filter((category) => category !== sourceCategory)
                : prev.pageBreaks,
            name: 'Custom',
        };
    });
};

const moveIntoCategory = (
    context: FreeTextMoveContext,
    product: Product,
    targetCategory: string,
    insertion: 'start' | 'end'
) => {
    placeFreeTextInCategory(context, product, targetCategory, { type: 'edge', edge: insertion });
};

const moveInsideCategory = (
    context: FreeTextMoveContext,
    product: Product,
    targetProductId: string,
    placement: 'before' | 'after'
) => {
    placeFreeTextInCategory(context, product, product.category, {
        type: 'product',
        productId: targetProductId,
        position: placement,
    });
};

export const swapFreeTextItems = (
    context: FreeTextMoveContext,
    product: Product,
    neighbor: Product
) => {
    const sourceCategory = product.category;
    const targetCategory = neighbor.category;
    const sourceMargin = product.customMarginTop || 0;
    const targetMargin = neighbor.customMarginTop || 0;

    context.onUpdateProducts?.([
        { id: product.id, field: 'category', value: targetCategory },
        { id: product.id, field: 'customMarginTop', value: targetMargin },
        { id: neighbor.id, field: 'category', value: sourceCategory },
        { id: neighbor.id, field: 'customMarginTop', value: sourceMargin },
    ]);

    context.onStyleUpdate?.((prev) => {
        const productOrder = { ...(prev.customProductOrder || {}) };
        const sourceOrder = getCurrentProductOrder(sourceCategory, context.groupedProducts, productOrder[sourceCategory]);
        const targetOrder = getCurrentProductOrder(targetCategory, context.groupedProducts, productOrder[targetCategory]);

        if (sourceCategory === targetCategory) {
            const nextOrder = [...sourceOrder];
            const sourceIndex = nextOrder.indexOf(product.id);
            const targetIndex = nextOrder.indexOf(neighbor.id);
            if (sourceIndex !== -1 && targetIndex !== -1) {
                [nextOrder[sourceIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[sourceIndex]];
                productOrder[sourceCategory] = uniqueOrder(nextOrder);
            }
        } else {
            productOrder[sourceCategory] = replaceInOrder(sourceOrder, product.id, neighbor.id);
            productOrder[targetCategory] = replaceInOrder(targetOrder, neighbor.id, product.id);
        }

        return { ...prev, customProductOrder: productOrder, name: 'Custom' };
    });
};

export const moveFreeTextOneStep = (
    context: FreeTextMoveContext,
    productId: string,
    direction: 'up' | 'down'
) => {
    const product = context.products.find((candidate) => candidate.id === productId);
    if (!product?.isFreeText) return false;

    const visualList = buildFreeTextVisualList(context.sortedCategories, context.groupedProducts);
    const currentIndex = visualList.findIndex((item) => item.type === 'product' && item.id === productId);
    if (currentIndex === -1) return false;

    const neighbor = direction === 'up' ? visualList[currentIndex - 1] : visualList[currentIndex + 1];
    const isGhostCategory = product.category.startsWith(FREE_TEXT_PREFIX);
    const categoryProducts = context.groupedProducts[product.category] || [];
    const categoryProductIndex = categoryProducts.findIndex((candidate) => candidate.id === product.id);

    const moveFreely = (marginDelta: number) => {
        const currentMargin = product.customMarginTop || 0;
        let boundedMarginDelta = marginDelta;

        if (isGhostCategory && marginDelta < 0 && typeof document !== 'undefined') {
            const element = getRenderedMenuElementById(`product-container-${product.id}`);
            const pageElement = element?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
            const columnElement = element?.closest<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]');
            if (element && pageElement) {
                const elementRect = element.getBoundingClientRect();
                const pageRect = pageElement.getBoundingClientRect();
                const columnRect = columnElement?.getBoundingClientRect();
                const scale = pageRect.height > 0 ? pageRect.height / MENU_PAGE_HEIGHT_PX : 1;
                const safeTop = columnRect?.top
                    ?? pageRect.top + ((context.style?.pagePadding || 48) * scale);
                const availableDelta = (safeTop - elementRect.top) / Math.max(scale, 0.001);
                boundedMarginDelta = Math.max(marginDelta, Math.ceil(availableDelta));
            }
        }

        if (boundedMarginDelta === 0) return false;
        const overflow = boundedMarginDelta > 0
            ? getFreeTextPageOverflow(product.id, context.style, boundedMarginDelta)
            : null;

        if (overflow?.shouldAdvance) {
            moveFreeTextToNextPage(context, product, Math.round(overflow.overflowPx));
            return true;
        }

        const nextMargin = currentMargin + boundedMarginDelta;
        context.onUpdateProduct?.(
            product.id,
            'customMarginTop',
            isGhostCategory ? nextMargin : Math.max(0, nextMargin)
        );
        return true;
    };

    const moveUpFreelyIfNeeded = () => {
        const currentMargin = product.customMarginTop || 0;
        if (currentMargin > NUDGE_STEP) return moveFreely(-NUDGE_STEP);
        if (currentMargin > 0) return moveFreely(-currentMargin);
        return false;
    };

    const moveDownFreelyIntoNeighborGap = (target: Product) => {
        const targetItem: FreeTextVisualItem = { type: 'product', id: target.id, category: target.category, product: target };
        const gap = getVerticalGap(product.id, targetItem, 'down');
        if (gap !== null) {
            if (gap > NUDGE_STEP) return moveFreely(NUDGE_STEP);
            if (gap > 0) return moveFreely(gap);
            return false;
        }

        if (target.isFreeText) {
            const currentMargin = product.customMarginTop || 0;
            const targetMargin = target.customMarginTop || 0;
            if (targetMargin - currentMargin > NUDGE_STEP) return moveFreely(NUDGE_STEP);
            return false;
        }

        return false;
    };

    const moveDownFreelyUntilTouching = (target: FreeTextVisualItem) => {
        const gap = getVerticalGap(product.id, target, 'down');
        if (gap === null) {
            if (target.type === 'product' && target.product.isFreeText) {
                const currentMargin = product.customMarginTop || 0;
                const targetMargin = target.product.customMarginTop || 0;
                if (targetMargin - currentMargin > NUDGE_STEP) return moveFreely(NUDGE_STEP);
            }
            return false;
        }
        if (gap > NUDGE_STEP) return moveFreely(NUDGE_STEP);
        if (gap > 0) return moveFreely(gap);
        return false;
    };

    const moveUpFreelyUntilTouching = (target: FreeTextVisualItem) => {
        const surfaceGap = isGhostCategory ? getFreeTextSurfaceGap(product.id, 'up') : null;
        const gap = surfaceGap ?? getVerticalGap(product.id, target, 'up');
        if (gap !== null) {
            if (gap > NUDGE_STEP) return moveFreely(-NUDGE_STEP);
            if (gap > 0) return moveFreely(-gap);
            return false;
        }

        const currentMargin = product.customMarginTop || 0;

        if (target.type === 'product' && target.product.isFreeText) {
            const targetMargin = target.product.customMarginTop || 0;
            if (currentMargin - targetMargin > NUDGE_STEP) return moveFreely(-NUDGE_STEP);
            return false;
        }

        if (currentMargin > NUDGE_STEP) return moveFreely(-NUDGE_STEP);
        if (currentMargin > 0) return moveFreely(-currentMargin);

        return false;
    };

    const moveTowardNearestRenderedFreeText = () => {
        if (!isGhostCategory) return false;

        const target = getNearestRenderedFreeText(context, product.id, direction);
        if (!target) return false;

        const surfaceGap = getFreeTextSurfaceGap(product.id, direction);
        if (
            surfaceGap !== null &&
            target.gap > surfaceGap + FREE_TEXT_SURFACE_TOLERANCE
        ) {
            return false;
        }

        if (target.gap > 0) {
            const delta = Math.min(NUDGE_STEP, target.gap);
            return moveFreely(direction === 'up' ? -delta : delta);
        }

        swapFreeTextItems(context, product, target.product);
        return true;
    };

    if (moveTowardNearestRenderedFreeText()) return true;

    if (direction === 'down' && isGhostCategory) {
        const overflow = getFreeTextPageOverflow(product.id, context.style, NUDGE_STEP);
        if (overflow?.shouldAdvance) {
            moveFreeTextToNextPage(context, product, Math.round(overflow.overflowPx));
            return true;
        }
    }

    if (!neighbor) {
        if (isGhostCategory) {
            return moveFreely(direction === 'up' ? -NUDGE_STEP : NUDGE_STEP);
        }

        if (direction === 'up') {
            if (moveUpFreelyIfNeeded()) return true;
            moveToGhostSlot(context, product, product.category, 'before', 0);
            return true;
        }

        moveToGhostSlot(context, product, product.category, 'after', STANDARD_GAP);
        return true;
    }

    if (!isGhostCategory) {
        const nextProduct = categoryProducts[categoryProductIndex + 1];
        const previousProduct = categoryProducts[categoryProductIndex - 1];

        if (direction === 'up') {
            if (previousProduct) {
                moveInsideCategory(context, product, previousProduct.id, 'before');
                return true;
            }

            moveToGhostSlot(context, product, product.category, 'before', 0);
            return true;
        }

        if (nextProduct) {
            moveInsideCategory(context, product, nextProduct.id, 'after');
            return true;
        }

        moveToGhostSlot(context, product, product.category, 'after', STANDARD_GAP);
        return true;
    }

    if (direction === 'up') {
        if (neighbor.type === 'product') {
            if (moveUpFreelyUntilTouching(neighbor)) return true;

            if (neighbor.product.isFreeText) {
                swapFreeTextItems(context, product, neighbor.product);
                return true;
            }

            moveIntoCategory(context, product, neighbor.category, 'end');
            return true;
        }

        if (moveUpFreelyUntilTouching(neighbor)) return true;
        moveIntoCategory(context, product, neighbor.category, 'start');
        return true;
    }

    if (neighbor.type === 'product') {
        if (neighbor.category === product.category) {
            if (moveDownFreelyIntoNeighborGap(neighbor.product)) return true;

            if (neighbor.product.isFreeText) {
                swapFreeTextItems(context, product, neighbor.product);
                return true;
            }

            moveInsideCategory(context, product, neighbor.product.id, 'after');
            return true;
        }

        if (neighbor.product.isFreeText) {
            if (moveDownFreelyUntilTouching(neighbor)) return true;

            swapFreeTextItems(context, product, neighbor.product);
            return true;
        }

        if (moveDownFreelyUntilTouching(neighbor)) return true;
        moveIntoCategory(context, product, neighbor.category, 'start');
        return true;
    }

    if (moveDownFreelyUntilTouching(neighbor)) return true;
    moveIntoCategory(context, product, neighbor.category, 'start');
    return true;
};
