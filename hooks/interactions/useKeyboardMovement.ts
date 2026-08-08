import React, { useEffect, useRef, useMemo } from 'react';
import { Product } from '../../types';
import { InteractionProps, DraftItem, FREE_TEXT_PREFIX, A4_HEIGHT_PX, NUDGE_STEP, SelectionItem, SelectionType, MoveDirection } from './types';
import { getCollisionSafeFreeTextTop, moveFreeTextOneStep } from './freeTextMovement';
import { SAFETY_BUFFER } from '../../utils/menuPagination';
import { isPristineNewCategory, isPristineNewProduct } from '../../utils/pristineItems';

const isCanvasObjectOrControlTarget = (target: EventTarget | null, pageEl: HTMLElement) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target === pageEl) return false;

    return Boolean(target.closest([
        'button',
        'input',
        'textarea',
        'select',
        'option',
        'label',
        'a',
        '[contenteditable="true"]',
        '[data-drag-ignore="true"]',
        '[data-print-control="true"]',
        '[data-added-image-drag="true"]',
        '[data-drag-type]',
        '.automenu-drag-item',
        '.automenu-image-resize-handle',
    ].join(',')));
};

export const useKeyboardMovement = (
    props: InteractionProps,
    sortedCategories: string[],
    groupedProducts: Record<string, Product[]>,
    draftItem: DraftItem | null,
    setDraftItem: (item: DraftItem | null) => void,
    selectedItems: SelectionItem[] = [],
    clearMultiSelectionTo?: (type: SelectionType, id: string | null) => void
) => {
    const { 
        products, style, scale,
        onMoveCategory, onMoveProduct, onUpdateProduct, onUpdateProducts,
        onStyleUpdate, onAddProduct, onAddCategory, onToggleProductVisibility, onDeleteProduct
    } = props;

    const draftInputRef = useRef<HTMLDivElement>(null);
    const pendingDraftPlacementRef = useRef<{
        id: string;
        pageIndex: number;
        columnIndex: number;
        top: number;
        ghostCategory: string;
        anchorCategory: string | null;
        relocated: boolean;
    } | null>(null);

    useEffect(() => {
        const pendingPlacement = pendingDraftPlacementRef.current;
        if (!pendingPlacement || !products.some(product => product.id === pendingPlacement.id) || !onUpdateProduct) return;

        let cancelled = false;
        let retryTimer: number | null = null;
        let attempts = 0;

        const alignWithDraftPosition = () => {
            if (cancelled) return;

            const product = products.find(candidate => candidate.id === pendingPlacement.id);
            const element = document.getElementById(`product-container-${pendingPlacement.id}`);
            const pageElement = element?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
            const columnElement = element?.closest<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]');

            if (!product || !element || !pageElement) {
                attempts += 1;
                if (attempts < 8) retryTimer = window.setTimeout(alignWithDraftPosition, 40);
                else pendingDraftPlacementRef.current = null;
                return;
            }

            const renderedPageIndex = Number(pageElement.dataset.pageIndex ?? 0);
            const renderedColumnIndex = Number(columnElement?.dataset.dragColumnIndex ?? 0);
            if (renderedPageIndex !== pendingPlacement.pageIndex || renderedColumnIndex !== pendingPlacement.columnIndex) {
                if (!pendingPlacement.relocated && pendingPlacement.anchorCategory && onStyleUpdate) {
                    pendingPlacement.relocated = true;
                    onStyleUpdate(prev => {
                        const currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0
                            ? [...prev.customCategoryOrder]
                            : [...sortedCategories];
                        sortedCategories.forEach(category => {
                            if (!currentOrder.includes(category)) currentOrder.push(category);
                        });

                        const nextOrder = currentOrder.filter(category => category !== pendingPlacement.ghostCategory);
                        const anchorIndex = nextOrder.indexOf(pendingPlacement.anchorCategory!);
                        if (anchorIndex === -1) return prev;

                        const insertIndex = renderedPageIndex < pendingPlacement.pageIndex
                            ? anchorIndex + 1
                            : anchorIndex;
                        nextOrder.splice(insertIndex, 0, pendingPlacement.ghostCategory);
                        return { ...prev, customCategoryOrder: nextOrder, name: 'Custom' };
                    });
                    return;
                }

                attempts += 1;
                if (attempts < 8) retryTimer = window.setTimeout(alignWithDraftPosition, 40);
                else pendingDraftPlacementRef.current = null;
                return;
            }

            const currentScale = (typeof scale === 'number' && scale > 0) ? scale : 1;
            const elementRect = element.getBoundingClientRect();
            const pageRect = pageElement.getBoundingClientRect();
            const columnRect = columnElement?.getBoundingClientRect();
            const pagePadding = style.pagePadding || 48;
            const safeClientTop = getCollisionSafeFreeTextTop({
                root: pageElement,
                desiredTop: pageRect.top + (pendingPlacement.top * currentScale),
                height: elementRect.height,
                pointerY: pageRect.top + (pendingPlacement.top * currentScale),
                excludeProductId: pendingPlacement.id,
                minTop: columnRect?.top ?? pageRect.top + (pagePadding * currentScale),
                maxBottom: pageRect.bottom - ((pagePadding + SAFETY_BUFFER) * currentScale),
                minLeft: columnRect?.left,
                maxRight: columnRect?.right,
            });
            const renderedTop = (elementRect.top - pageRect.top) / currentScale;
            const targetTop = ((safeClientTop ?? elementRect.top) - pageRect.top) / currentScale;
            const difference = targetTop - renderedTop;
            pendingDraftPlacementRef.current = null;

            if (Math.abs(difference) > 0.5) {
                onUpdateProduct(
                    pendingPlacement.id,
                    'customMarginTop',
                    (product.customMarginTop || 0) + difference
                );
            }
        };

        const frame = window.requestAnimationFrame(alignWithDraftPosition);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frame);
            if (retryTimer !== null) window.clearTimeout(retryTimer);
        };
    }, [onStyleUpdate, onUpdateProduct, products, scale, sortedCategories, style.customCategoryOrder, style.customProductOrder]);

    const getProductSelectionType = (product: Product | undefined): SelectionType => (
        product?.isFreeText ? 'freeText' : 'product'
    );

    const getBatchActionItems = (clickedItem: SelectionItem) => {
        const isClickedSelected = selectedItems.some(item => item.id === clickedItem.id);
        return isClickedSelected && selectedItems.length > 1 ? selectedItems : [clickedItem];
    };

    // 3. Flattened Visual List (For Arrow Navigation)
    const visualList = useMemo(() => {
        const list: { type: 'header' | 'product', id: string, category: string, product?: Product, globalIndex: number }[] = [];
        let gIdx = 0;
        sortedCategories.forEach(cat => {
            list.push({type: 'header',id: cat,category: cat,globalIndex: gIdx++});
            const prods = groupedProducts[cat] || [];
            prods.forEach(p => {
                list.push({ type: 'product', id: p.id, category: cat, product: p, globalIndex: gIdx++ });
            });
        });
        return list;
    }, [sortedCategories, groupedProducts]);

    const handleGlobalMove = (e: React.MouseEvent, type: 'category' | 'product', id: string, catName: string, direction: MoveDirection) => {
        e.stopPropagation();

        const product = type === 'product' ? products.find(p => p.id === id) : undefined;
        const actionItems = getBatchActionItems({
            type: type === 'category' ? 'category' : getProductSelectionType(product) as Exclude<SelectionType, null>,
            id,
        });

        const sortedItems = [...actionItems].sort((a, b) => {
            const indexA = visualList.find(v => v.type === (a.type === 'category' ? 'header' : 'product') && v.id === a.id)?.globalIndex ?? 0;
            const indexB = visualList.find(v => v.type === (b.type === 'category' ? 'header' : 'product') && v.id === b.id)?.globalIndex ?? 0;
            return direction === 'up' || direction === 'left' ? indexA - indexB : indexB - indexA;
        });

        sortedItems.forEach(item => {
            if (item.type === 'category') {
                onMoveCategory?.(item.id, direction);
            } else {
                const p = products.find(prod => prod.id === item.id);
                if (!p) return;

                if (!p.isFreeText) {
                    onMoveProduct?.(p.id, p.category, direction);
                } else {
                    const verticalDirection = direction === 'up' || direction === 'left' ? 'up' : 'down';
                    moveFreeTextOneStep({
                        products,
                        sortedCategories,
                        groupedProducts,
                        onUpdateProduct,
                        onUpdateProducts,
                        onStyleUpdate,
                        style,
                    }, p.id, verticalDirection);
                }
            }
        });
    };

    const handlePageDoubleClick = (e: React.MouseEvent, pageIndex: number, handleSelection: any, setSelectedPageIndex: any) => {
        const pageEl = e.currentTarget as HTMLElement;
        if (isCanvasObjectOrControlTarget(e.target, pageEl)) {
            return;
        }

        e.stopPropagation();
        handleSelection(null, null);
        
        const pageRect = pageEl.getBoundingClientRect();
        const currentScale = (typeof scale === 'number' && scale > 0) ? scale : 1;
        let clickY = (e.clientY - pageRect.top) / currentScale;
        const columnEls = Array.from(
            pageEl.querySelectorAll<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]')
        );
        const clickedColumnEl = columnEls.find((columnEl) => {
            const rect = columnEl.getBoundingClientRect();
            return e.clientX >= rect.left && e.clientX <= rect.right;
        }) || columnEls.reduce<HTMLElement | null>((best, columnEl) => {
            if (!best) return columnEl;
            const rect = columnEl.getBoundingClientRect();
            const bestRect = best.getBoundingClientRect();
            const distance = Math.abs(e.clientX - (rect.left + rect.width / 2));
            const bestDistance = Math.abs(e.clientX - (bestRect.left + bestRect.width / 2));
            return distance < bestDistance ? columnEl : best;
        }, null);
        const columnIndex = Number(clickedColumnEl?.dataset.dragColumnIndex ?? 0);
        
        let floorId: string | null = null;
        let floorBottom = 0; 
        let ceilingId: string | null = null;
        let ceilingTop = A4_HEIGHT_PX; 
        
        let minDistAbove = Infinity;
        let minDistBelow = Infinity;
        const searchRoot = clickedColumnEl || pageEl;
        const pagePadding = style.pagePadding || 48;
        const columnRect = clickedColumnEl?.getBoundingClientRect();
        const safeClientTop = getCollisionSafeFreeTextTop({
            root: pageEl,
            desiredTop: pageRect.top + (clickY * currentScale),
            height: 40 * currentScale,
            pointerY: e.clientY,
            minTop: columnRect?.top ?? pageRect.top + (pagePadding * currentScale),
            maxBottom: pageRect.bottom - ((pagePadding + SAFETY_BUFFER) * currentScale),
            minLeft: columnRect?.left,
            maxRight: columnRect?.right,
        });
        if (safeClientTop === null) return;
        clickY = (safeClientTop - pageRect.top) / currentScale;
        const allElements = searchRoot.querySelectorAll('[id^="product-container-"], [id^="category-header-"]');
        
        allElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const itemTop = (rect.top - pageRect.top) / currentScale;
            const itemHeight = rect.height / currentScale;
            const itemBottom = itemTop + itemHeight;
            
            let id = el.getAttribute('data-category-id') || el.getAttribute('data-block-id');
            if (!id && el.id.startsWith('product-container-')) id = el.id.replace('product-container-', '');
            if (!id) return;

            if (itemBottom < clickY) {
                const dist = clickY - itemBottom;
                if (dist < minDistAbove) {
                    minDistAbove = dist;
                    floorId = id;
                    floorBottom = itemBottom;
                }
            } else if (itemTop > clickY) {
                const dist = itemTop - clickY;
                if (dist < minDistBelow) {
                    minDistBelow = dist;
                    ceilingId = id;
                    ceilingTop = itemTop;
                }
            }
        });

        setDraftItem({
            pageIndex,
            columnIndex,
            top: clickY,
            floorId,
            floorBottom,
            ceilingId,
            ceilingTop
        });

        setTimeout(() => {
            if (draftInputRef.current) {
                draftInputRef.current.focus();
                const range = document.createRange();
                range.selectNodeContents(draftInputRef.current);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }, 50);
    };

    const handleDraftCommit = () => {
        if (!draftItem || !onAddProduct || !onStyleUpdate || !draftInputRef.current) return;
        const text = draftInputRef.current.innerText.trim();
        if (!text) {
            setDraftItem(null);
            return;
        }
        const newId = crypto.randomUUID();
        const ghostCategoryName = `${FREE_TEXT_PREFIX}${newId}`;

        const getCurrentOrder = (customOrder?: string[]) => {
            const currentOrder = customOrder && customOrder.length > 0
                ? [...customOrder]
                : [...sortedCategories];
            sortedCategories.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });
            return currentOrder;
        };

        const getDraftInsertIndex = (currentOrder: string[]) => {
            if (draftItem.ceilingId) {
               const cProd = products.find(p => p.id === draftItem.ceilingId);
               const cCat = cProd ? cProd.category : (currentOrder.includes(draftItem.ceilingId!) ? draftItem.ceilingId : null);
               if (cCat) {
                   const idx = currentOrder.indexOf(cCat);
                   if (idx !== -1) return idx;
               }
            }

            if (draftItem.floorId) {
               const fProd = products.find(p => p.id === draftItem.floorId);
               const fCat = fProd ? fProd.category : (currentOrder.includes(draftItem.floorId!) ? draftItem.floorId : null);
               if (fCat) {
                   const idx = currentOrder.indexOf(fCat);
                   if (idx !== -1) return idx + 1;
               }
            }

            return currentOrder.length;
        };

        const floorProduct = draftItem.floorId ? products.find(p => p.id === draftItem.floorId) : null;
        const ceilingProduct = draftItem.ceilingId ? products.find(p => p.id === draftItem.ceilingId) : null;
        const newItemMargin = Math.max(0, draftItem.top - draftItem.floorBottom);

        pendingDraftPlacementRef.current = {
            id: newId,
            pageIndex: draftItem.pageIndex,
            columnIndex: draftItem.columnIndex,
            top: draftItem.top,
            ghostCategory: ghostCategoryName,
            anchorCategory: floorProduct?.category
                || ceilingProduct?.category
                || (draftItem.floorId && sortedCategories.includes(draftItem.floorId) ? draftItem.floorId : null)
                || (draftItem.ceilingId && sortedCategories.includes(draftItem.ceilingId) ? draftItem.ceilingId : null),
            relocated: false,
        };

        onStyleUpdate(prev => {
            const currentOrder = getCurrentOrder(prev.customCategoryOrder);
            const insertIndex = getDraftInsertIndex(currentOrder);

            currentOrder.splice(insertIndex, 0, ghostCategoryName);

            const newProdOrder = { ...(prev.customProductOrder || {}) };
            newProdOrder[ghostCategoryName] = [newId];

            return {
                ...prev,
                customCategoryOrder: currentOrder,
                customProductOrder: newProdOrder,
                name: 'Custom'
            };
        });

        onAddProduct(ghostCategoryName, undefined, true, newId, { customMarginTop: newItemMargin, name: text });
        setDraftItem(null);
    };

    const handleRemove = (e: React.MouseEvent, id: string, type: 'product' | 'category') => {
        e.stopPropagation();
        e.preventDefault();

        const clickedProduct = type === 'product' ? products.find(p => p.id === id) : undefined;
        const actionItems = getBatchActionItems({
            type: type === 'category' ? 'category' : getProductSelectionType(clickedProduct) as Exclude<SelectionType, null>,
            id,
        });
        
        const productIdsToDelete = new Set<string>();
        const productIdsToHide = new Set<string>();
        const categoriesToDelete = new Set<string>();
        const categoriesToHide = new Set<string>();

        actionItems.forEach(item => {
            if (item.type === 'category') {
                if (isPristineNewCategory(item.id, products)) categoriesToDelete.add(item.id);
                else categoriesToHide.add(item.id);
                return;
            }

            const product = products.find(p => p.id === item.id);
            if (product?.isFreeText || isPristineNewProduct(product)) productIdsToDelete.add(item.id);
            else productIdsToHide.add(item.id);
        });

        const deletedProductIds = new Set(productIdsToDelete);
        categoriesToDelete.forEach(category => {
            (groupedProducts[category] || products.filter(product => product.category === category)).forEach(product => {
                deletedProductIds.add(product.id);
            });
        });

        if (onStyleUpdate && (productIdsToHide.size > 0 || categoriesToHide.size > 0 || deletedProductIds.size > 0 || categoriesToDelete.size > 0)) {
             onStyleUpdate(prev => {
                 const currentHidden = new Set(prev.hiddenProductIds || []);
                 productIdsToHide.forEach(productId => currentHidden.add(productId));
                 categoriesToHide.forEach(category => {
                     (groupedProducts[category] || []).forEach(product => currentHidden.add(product.id));
                 });
                 deletedProductIds.forEach(productId => currentHidden.delete(productId));

                 const nextProductOrder = { ...(prev.customProductOrder || {}) };
                 Object.keys(nextProductOrder).forEach(category => {
                     if (categoriesToDelete.has(category)) {
                         delete nextProductOrder[category];
                         return;
                     }
                     nextProductOrder[category] = nextProductOrder[category].filter(productId => !deletedProductIds.has(productId));
                 });
                 const nextCategoryPlacements = { ...(prev.categoryPlacements || {}) };
                 const nextCategoryPositions = { ...(prev.categoryPositions || {}) };
                 categoriesToDelete.forEach((category) => {
                     delete nextCategoryPlacements[category];
                     delete nextCategoryPositions[category];
                 });

                 return {
                     ...prev,
                     hiddenProductIds: Array.from(currentHidden),
                     customCategoryOrder: (prev.customCategoryOrder || []).filter(category => !categoriesToDelete.has(category)),
                     customProductOrder: nextProductOrder,
                     categoryPlacements: nextCategoryPlacements,
                     categoryPositions: nextCategoryPositions,
                     name: 'Custom'
                 };
             });
        }

        deletedProductIds.forEach(productId => onDeleteProduct?.(productId));
    };
    
    // Wrapper for add functionality if handlers needs to expose it for MenuItem convenience
    const handleAddClick = (e: React.MouseEvent, category: string, isCategoryAdd: boolean, position: 'before' | 'after') => {
        if (isCategoryAdd) {
            onAddCategory?.(category, position);
        } else {
            onAddProduct?.(category, undefined, false, undefined, undefined, { index: 0 }); 
        }
    };

    return {
        visualList,
        draftInputRef,
        handleGlobalMove,
        handlePageDoubleClick,
        handleDraftCommit,
        handleRemove,
        handleAddClick
    };
};
