import React, { useRef, useMemo } from 'react';
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
        const pageIsEmpty = !pageEl.querySelector('[id^="product-container-"], [id^="category-header-"], [data-menu-heading]');
        
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
            ceilingTop,
            forcePagePlacement: pageIsEmpty,
            blankPageId: pageEl.dataset.blankPageId || null,
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

        onStyleUpdate(prev => {
            const currentOrder = getCurrentOrder(prev.customCategoryOrder);
            const insertIndex = getDraftInsertIndex(currentOrder);

            currentOrder.splice(insertIndex, 0, ghostCategoryName);

            const newProdOrder = { ...(prev.customProductOrder || {}) };
            newProdOrder[ghostCategoryName] = [newId];
            const shiftedPlacements = Object.fromEntries(
                Object.entries(draftItem.freeTextPositionUpdates || {}).map(([category, position]) => [
                    category,
                    { pageIndex: position.pageIndex, columnIndex: position.columnIndex },
                ]),
            );

            return {
                ...prev,
                customCategoryOrder: currentOrder,
                customProductOrder: newProdOrder,
                blankPages: draftItem.blankPageId
                    ? (prev.blankPages || []).filter((blankPage) => blankPage.id !== draftItem.blankPageId)
                    : prev.blankPages,
                categoryPlacements: {
                    ...(prev.categoryPlacements || {}),
                    ...shiftedPlacements,
                    [ghostCategoryName]: {
                        pageIndex: draftItem.pageIndex,
                        columnIndex: draftItem.columnIndex,
                    },
                },
                categoryPositions: {
                    ...(prev.categoryPositions || {}),
                    ...(draftItem.freeTextPositionUpdates || {}),
                    [ghostCategoryName]: {
                        pageIndex: draftItem.pageIndex,
                        columnIndex: draftItem.columnIndex,
                        y: Math.max(0, draftItem.top),
                    },
                },
                name: 'Custom'
            };
        });

        onAddProduct(ghostCategoryName, undefined, true, newId, { customMarginTop: 0, name: text });
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
            if (product?.isFreeText || isPristineNewProduct(product)) {
                productIdsToDelete.add(item.id);
                if (product?.isFreeText && product.category.startsWith(FREE_TEXT_PREFIX)) {
                    categoriesToDelete.add(product.category);
                }
            } else productIdsToHide.add(item.id);
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
        clearMultiSelectionTo?.(null, null);
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
