import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Product, MenuStyle } from '../../types';
import { FREE_TEXT_PREFIX, FormattingField, FormattingTarget, InteractionProps, SelectableType, SelectionItem, SelectionType } from './types';
import { parseAndRoundPrice } from '../../utils/price';
import { measureWordFitElement, triggerLimitFeedback } from '../../utils/textFit';

const getSelectionKey = (type: SelectionType, id: string | null) => `${type || 'none'}:${id || ''}`;

const isSameSelectionItem = (left: SelectionItem | null, right: SelectionItem | null) =>
    Boolean(left && right && left.type === right.type && left.id === right.id);

const uniqueSelectionItems = (items: SelectionItem[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = getSelectionKey(item.type, item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const useSelectionState = (
    props: InteractionProps,
    sortedCategories: string[] = [],
    groupedProducts: Record<string, Product[]> = {}
) => {
    const { onSelectionChange, onUpdateProduct, onUpdateCategoryName, onUpdateMenuText, onDeleteProduct, onStyleUpdate, products, style } = props;

    // Selection & Editing State
    const [selectedId, setSelectedId] = useState<string | null>(null); 
    const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formattingTarget, setFormattingTarget] = useState<FormattingTarget | null>(null);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [showAddModal, setShowAddModal] = useState<{category: string, rect: DOMRect} | null>(null);
    const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
    const lastRangeAnchorRef = useRef<SelectionItem | null>(null);
    const lastEmittedSelectionRef = useRef<string | null>(null);
    
    // Delete Confirmation State
    const [showDeletePageConfirm, setShowDeletePageConfirm] = useState(false);
    const [pageToDelete, setPageToDelete] = useState<number | null>(null);

    const selectableItems = useMemo<SelectionItem[]>(() => {
        const items: SelectionItem[] = [];

        sortedCategories.forEach((category) => {
            if (!category.startsWith(FREE_TEXT_PREFIX)) {
                items.push({ type: 'category', id: category });
            }

            (groupedProducts[category] || []).forEach((product) => {
                items.push({
                    type: product.isFreeText ? 'freeText' : 'product',
                    id: product.id,
                });
            });
        });

        return items;
    }, [groupedProducts, sortedCategories]);

    const visibleCategories = useMemo(
        () => sortedCategories.filter((category) => !category.startsWith(FREE_TEXT_PREFIX)),
        [sortedCategories]
    );

    const emitSelection = useCallback((type: SelectionType, id: string | null) => {
        lastEmittedSelectionRef.current = getSelectionKey(type, id);
        onSelectionChange?.({ type, id });
    }, [onSelectionChange]);

    const getSingleSelectionItem = useCallback((type: SelectionType, id: string | null): SelectionItem | null => {
        if (!type || !id) return null;
        return { type: type as SelectableType, id };
    }, []);

    const getItemCategory = useCallback((item: SelectionItem) => {
        if (item.type === 'category') return item.id;
        const product = products.find((candidate) => candidate.id === item.id);
        return product?.category && !product.category.startsWith(FREE_TEXT_PREFIX)
            ? product.category
            : null;
    }, [products]);

    const getCategorySelectionsFor = useCallback((items: SelectionItem[]) => (
        uniqueSelectionItems(
            items
                .map((item) => getItemCategory(item))
                .filter((category): category is string => Boolean(category))
                .map((category) => ({ type: 'category' as const, id: category }))
        )
    ), [getItemCategory]);

    const getPageRange = useCallback((fromId: string, toId: string): SelectionItem[] => {
        const start = Number(fromId);
        const end = Number(toId);
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            return [{ type: 'page', id: toId }];
        }

        const [from, to] = start < end ? [start, end] : [end, start];
        return Array.from({ length: to - from + 1 }, (_, index) => ({
            type: 'page' as const,
            id: String(from + index),
        }));
    }, []);

    const getSelectionAddControls = useCallback((type: SelectionType, id: string | null) => {
        if (!type || !id || selectedItems.length <= 1) return { top: true, bottom: true };
        if (!selectedItems.some((item) => item.type === type && item.id === id)) return { top: false, bottom: false };

        const selectedCategoryIds = new Set(
            selectedItems
                .filter((item) => item.type === 'category')
                .map((item) => item.id)
        );

        if (selectedCategoryIds.size > 0) {
            if (type !== 'category' || !selectedCategoryIds.has(id)) return { top: false, bottom: false };

            const categoryIndex = visibleCategories.indexOf(id);
            if (categoryIndex === -1) return { top: true, bottom: true };

            return {
                top: !selectedCategoryIds.has(visibleCategories[categoryIndex - 1]),
                bottom: !selectedCategoryIds.has(visibleCategories[categoryIndex + 1]),
            };
        }

        const selectedKeys = new Set(selectedItems.map((item) => getSelectionKey(item.type, item.id)));
        const itemIndex = selectableItems.findIndex((item) => item.type === type && item.id === id);
        if (itemIndex === -1) return { top: true, bottom: true };

        const previous = selectableItems[itemIndex - 1];
        const next = selectableItems[itemIndex + 1];

        return {
            top: !previous || !selectedKeys.has(getSelectionKey(previous.type, previous.id)),
            bottom: !next || !selectedKeys.has(getSelectionKey(next.type, next.id)),
        };
    }, [selectableItems, selectedItems, visibleCategories]);

    const getPageAddControls = useCallback((pageIndex: number) => {
        const selectedPageIndexes = selectedItems
            .filter((item) => item.type === 'page')
            .map((item) => Number(item.id))
            .filter((index) => Number.isFinite(index));

        if (selectedPageIndexes.length <= 1) return { before: true, after: true };
        if (!selectedPageIndexes.includes(pageIndex)) return { before: false, after: false };

        const selectedPageSet = new Set(selectedPageIndexes);
        return {
            before: !selectedPageSet.has(pageIndex - 1),
            after: !selectedPageSet.has(pageIndex + 1),
        };
    }, [selectedItems]);

    // Sync from parent selection state
    React.useEffect(() => {
        if (props.selection) {
            const incomingKey = getSelectionKey(props.selection.type, props.selection.id);
            if (incomingKey === lastEmittedSelectionRef.current) return;

            if (props.selection.id === null) {
                setFormattingTarget(null);
                setSelectedId(null);
                setEditingId(null);
                setSelectedPageIndex(null);
                setSelectedItems([]);
                lastRangeAnchorRef.current = null;
            } else if (props.selection.type === 'page') {
                setSelectedPageIndex(parseInt(props.selection.id));
                setSelectedId(null);
                const item = getSingleSelectionItem(props.selection.type, props.selection.id);
                setSelectedItems(item ? [item] : []);
                lastRangeAnchorRef.current = item;
            } else {
                setSelectedId(props.selection.id);
                setSelectedPageIndex(null);
                const item = getSingleSelectionItem(props.selection.type, props.selection.id);
                setSelectedItems(item ? [item] : []);
                lastRangeAnchorRef.current = item;
            }
        }
    }, [getSingleSelectionItem, props.selection]);

    const handleSelection = useCallback((type: SelectionType, id: string | null, options?: { shiftKey?: boolean; ctrlKey?: boolean }) => {
        if (!type || !id) {
            setFormattingTarget(null);
            setSelectedId(null);
            setSelectedPageIndex(null);
            setSelectedItems([]);
            lastRangeAnchorRef.current = null;
            emitSelection(type, id);
            return;
        }

        setFormattingTarget(current => current && current.type === type && current.id === id ? current : null);

        const effectiveCtrlKey = Boolean(options?.ctrlKey || multiSelectMode);

        if (type === 'page') {
            const pageItem: SelectionItem = { type: 'page', id };
            let nextPageItems: SelectionItem[];

            if (options?.shiftKey && lastRangeAnchorRef.current?.type === 'page') {
                nextPageItems = getPageRange(lastRangeAnchorRef.current.id, id);
            } else if (effectiveCtrlKey) {
                const currentPageItems = selectedItems.filter((item) => item.type === 'page');
                const isAlreadySelected = currentPageItems.some((item) => item.id === id);
                nextPageItems = isAlreadySelected
                    ? currentPageItems.filter((item) => item.id !== id)
                    : [...currentPageItems, pageItem];
            } else {
                nextPageItems = [pageItem];
            }

            const activePageItem = nextPageItems[nextPageItems.length - 1] || null;
            setSelectedId(null);
            setSelectedItems(nextPageItems);
            lastRangeAnchorRef.current = pageItem;
            setSelectedPageIndex(activePageItem ? parseInt(activePageItem.id) : null);
            emitSelection(activePageItem?.type || null, activePageItem?.id || null);
            return;
        }

        const nextItem = getSingleSelectionItem(type, id);
        const objectSelectedItems = selectedItems.filter((item) => item.type !== 'page');

        if (
            (effectiveCtrlKey || options?.shiftKey) &&
            nextItem &&
            objectSelectedItems.some((item) => item.type === 'category') &&
            (nextItem.type === 'product' || nextItem.type === 'freeText')
        ) {
            const categoryItems = getCategorySelectionsFor([...objectSelectedItems, nextItem]);
            setSelectedItems(categoryItems);
            const activeItem = categoryItems[categoryItems.length - 1] || null;
            lastRangeAnchorRef.current = activeItem;
            setSelectedId(activeItem?.id || null);
            setSelectedPageIndex(null);
            emitSelection(activeItem?.type || null, activeItem?.id || null);
            return;
        }

        if (
            (effectiveCtrlKey || options?.shiftKey) &&
            nextItem?.type === 'category' &&
            objectSelectedItems.some((item) => item.type === 'product' || item.type === 'freeText')
        ) {
            const categoryItems = getCategorySelectionsFor([...objectSelectedItems, nextItem]);
            setSelectedItems(categoryItems);
            lastRangeAnchorRef.current = nextItem;
            setSelectedId(nextItem.id);
            setSelectedPageIndex(null);
            emitSelection(nextItem.type, nextItem.id);
            return;
        }

        if (effectiveCtrlKey && nextItem) {
            const isAlreadySelected = objectSelectedItems.some((item) => isSameSelectionItem(item, nextItem));
            const nextSelectedItems = isAlreadySelected
                ? objectSelectedItems.filter((item) => !isSameSelectionItem(item, nextItem))
                : [...objectSelectedItems, nextItem];
            const activeItem = isAlreadySelected
                ? nextSelectedItems[nextSelectedItems.length - 1] || null
                : nextItem;

            setSelectedItems(nextSelectedItems);
            lastRangeAnchorRef.current = nextItem;
            setSelectedId(activeItem?.id || null);
            setSelectedPageIndex(null);
            emitSelection(activeItem?.type || null, activeItem?.id || null);
            return;
        }

        if (
            options?.shiftKey &&
            nextItem &&
            lastRangeAnchorRef.current &&
            type !== 'addedImage'
        ) {
            if (nextItem.type === 'category' && lastRangeAnchorRef.current.type === 'category') {
                const startIndex = visibleCategories.indexOf(lastRangeAnchorRef.current.id);
                const endIndex = visibleCategories.indexOf(nextItem.id);

                if (startIndex !== -1 && endIndex !== -1) {
                    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
                    setSelectedItems(visibleCategories.slice(from, to + 1).map((category) => ({
                        type: 'category' as const,
                        id: category,
                    })));
                    lastRangeAnchorRef.current = nextItem;
                    setSelectedId(id);
                    setSelectedPageIndex(null);
                    emitSelection(type, id);
                    return;
                }
            }

            const startIndex = selectableItems.findIndex((item) => isSameSelectionItem(item, lastRangeAnchorRef.current));
            const endIndex = selectableItems.findIndex((item) => isSameSelectionItem(item, nextItem));

            if (startIndex !== -1 && endIndex !== -1) {
                const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
                setSelectedItems(selectableItems.slice(from, to + 1));
            } else {
                setSelectedItems([nextItem]);
                lastRangeAnchorRef.current = nextItem;
            }
        } else {
            setSelectedItems(nextItem ? [nextItem] : []);
            lastRangeAnchorRef.current = nextItem;
        }

        setSelectedId(id);
        setSelectedPageIndex(null);
        emitSelection(type, id);
    }, [
        emitSelection,
        getCategorySelectionsFor,
        getPageRange,
        getSingleSelectionItem,
        multiSelectMode,
        selectableItems,
        selectedItems,
        visibleCategories,
    ]);

    const clearMultiSelectionTo = useCallback((type: SelectionType, id: string | null) => {
        const item = getSingleSelectionItem(type, id);
        setSelectedItems(item ? [item] : []);
        lastRangeAnchorRef.current = item;

        if (type === 'page') {
            setSelectedId(null);
            if (id !== null) setSelectedPageIndex(parseInt(id));
        } else {
            setSelectedId(id);
            if (id !== null) {
                setSelectedPageIndex(null);
            }
        }

        emitSelection(type, id);
    }, [emitSelection, getSingleSelectionItem]);

    const replaceSelectedItems = useCallback((items: SelectionItem[]) => {
        const nextItems = uniqueSelectionItems(items);
        const activeItem = nextItems[nextItems.length - 1] || null;

        setFormattingTarget(null);
        setSelectedItems(nextItems);
        lastRangeAnchorRef.current = activeItem;
        setSelectedId(activeItem?.type === 'page' ? null : activeItem?.id || null);
        setSelectedPageIndex(activeItem?.type === 'page' ? Number(activeItem.id) : null);
        emitSelection(activeItem?.type || null, activeItem?.id || null);
    }, [emitSelection]);

    const isSelected = useCallback((type: SelectionType, id: string | null) => {
        if (!id) return false;
        if (
            selectedItems.some((item) => item.type === 'category') &&
            type !== 'category'
        ) {
            return false;
        }
        if (selectedItems.some((item) => item.id === id && item.type === type)) return true;
        return selectedId === id;
    }, [selectedId, selectedItems]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLElement>, type: string, id: string, field?: string) => {
        if (type === 'product' && field === 'price') {
            const normalizedPrice = parseAndRoundPrice(e.currentTarget.innerText);
            if (normalizedPrice !== null) {
                e.currentTarget.innerText = normalizedPrice.toFixed(2);
                const fit = measureWordFitElement(e.currentTarget, { text: e.currentTarget.innerText });
                e.currentTarget.dataset.wordOverflow = String(!fit.fits);
            }
        }
        if (e.currentTarget.dataset.wordOverflow === 'true') {
            let originalValue = '';
            if (type === 'product' && field) {
                const original = products.find((product) => product.id === id);
                originalValue = field === 'price'
                    ? (original?.price.toFixed(2) || '0.00')
                    : String(original?.[field as keyof Product] || '');
            } else if (type === 'category') {
                originalValue = id;
            } else if (type === 'menu' && field) {
                originalValue = String(style[field as 'menuTitle' | 'menuSubtitle'] || '');
            }
            e.currentTarget.innerText = originalValue;
            e.currentTarget.dataset.wordOverflow = 'false';
            triggerLimitFeedback(e.currentTarget);
            setEditingId(null);
            return;
        }
        if (type === 'product') {
            window.setTimeout(() => {
                const activeElement = document.activeElement as HTMLElement | null;
                const isSameProductField = activeElement?.dataset.productEditId === id;
                const isFormattingControl = Boolean(activeElement?.closest('[data-inline-format-toolbar="true"]'));
                if (!isSameProductField && !isFormattingControl) {
                    setEditingId(current => current === id ? null : current);
                }
            }, 0);
        } else if (type !== 'floating') {
            setEditingId(null);
        }
        const newVal = e.currentTarget.innerText;
        if (type === 'product' && field && onUpdateProduct) {
            const product = products.find(candidate => candidate.id === id);
            if (field === 'name' && product?.isFreeText && newVal.trim() === '') {
                onStyleUpdate?.(prev => {
                    const nextProductOrder = { ...(prev.customProductOrder || {}) };
                    Object.keys(nextProductOrder).forEach(category => {
                        nextProductOrder[category] = nextProductOrder[category].filter(productId => productId !== id);
                    });

                    const isEmptyFreeTextCategory = product.category.startsWith(FREE_TEXT_PREFIX)
                        && !products.some(candidate => candidate.id !== id && candidate.category === product.category);
                    if (isEmptyFreeTextCategory) delete nextProductOrder[product.category];

                    return {
                        ...prev,
                        hiddenProductIds: (prev.hiddenProductIds || []).filter(productId => productId !== id),
                        customCategoryOrder: isEmptyFreeTextCategory
                            ? (prev.customCategoryOrder || []).filter(category => category !== product.category)
                            : prev.customCategoryOrder,
                        customProductOrder: nextProductOrder,
                        pageBreaks: isEmptyFreeTextCategory
                            ? (prev.pageBreaks || []).filter(category => category !== product.category)
                            : prev.pageBreaks,
                        name: 'Custom',
                    };
                });
                onDeleteProduct?.(id);
                setFormattingTarget(null);
                setSelectedId(null);
                setSelectedItems([]);
                lastRangeAnchorRef.current = null;
                emitSelection(null, null);
                return;
            }

            if (field === 'price') {
                const num = parseAndRoundPrice(newVal);
                if (num !== null) {
                    e.currentTarget.innerText = num.toFixed(2);
                    onUpdateProduct(id, 'price', num);
                }
                else e.currentTarget.innerText = products.find(p=>p.id === id)?.price.toFixed(2) || '0.00';
            } else {
                onUpdateProduct(id, field as keyof Product, newVal);
            }
        } else if (type === 'category' && onUpdateCategoryName) {
            onUpdateCategoryName(id, newVal); 
        } else if (type === 'menu' && onUpdateMenuText && field) {
            onUpdateMenuText(field as any, newVal);
        }
    }, [emitSelection, onDeleteProduct, onStyleUpdate, onUpdateProduct, onUpdateCategoryName, onUpdateMenuText, products, style]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (e.currentTarget.id.startsWith('product-price-')) {
                const normalizedPrice = parseAndRoundPrice(e.currentTarget.innerText);
                if (normalizedPrice !== null) {
                    e.currentTarget.innerText = normalizedPrice.toFixed(2);
                    const fit = measureWordFitElement(e.currentTarget, { text: e.currentTarget.innerText });
                    e.currentTarget.dataset.wordOverflow = String(!fit.fits);
                }
            }
            if (e.currentTarget.dataset.wordOverflow === 'true') {
                triggerLimitFeedback(e.currentTarget);
                return;
            }
            e.currentTarget.blur();
        }
    };

    const startEditing = (e: React.MouseEvent, id: string, elementIdToFocus?: string, field: FormattingField = 'name') => {
        e.stopPropagation();
        setEditingId(id);
        const product = products.find(p => p.id === id);
        const type: SelectionType = product ? (product.isFreeText ? 'freeText' : 'product') : 'category';
        const targetField: FormattingField = product?.isFreeText ? 'freeText' : type === 'category' ? 'category' : field;
        setFormattingTarget({
            type: type as FormattingTarget['type'],
            id,
            field: targetField,
            elementId: elementIdToFocus || `product-name-${id}`,
        });
        clearMultiSelectionTo(type, id);
        
        // Multi-stage focus attempt to ensure mobile keyboard triggers
        const triggerFocus = () => {
            const el = document.getElementById(elementIdToFocus || `product-name-${id}`);
            if (el) {
                el.focus();
                // Specific fix for iOS selection
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        };

        // Immediate and delayed attempts
        triggerFocus();
        setTimeout(triggerFocus, 50);
        setTimeout(triggerFocus, 100);
    };

    const setProductEditingField = (id: string, field: 'name' | 'price' | 'description', elementId: string) => {
        setFormattingTarget({ type: 'product', id, field, elementId });
    };

    const startMenuTextEditing = (type: 'menuTitle' | 'menuSubtitle', elementId: string) => {
        setFormattingTarget({ type, id: type, field: type, elementId });
    };

    return {
        selectedId, setSelectedId,
        selectedItems, setSelectedItems,
        multiSelectMode, setMultiSelectMode,
        editingId, setEditingId,
        formattingTarget, setFormattingTarget,
        showAddModal, setShowAddModal,
        selectedPageIndex, setSelectedPageIndex,
        showDeletePageConfirm, setShowDeletePageConfirm,
        pageToDelete, setPageToDelete,
        handleSelection,
        clearMultiSelectionTo,
        replaceSelectedItems,
        isSelected,
        getSelectionAddControls,
        getPageAddControls,
        handleBlur,
        handleKeyDown,
        startEditing,
        setProductEditingField,
        startMenuTextEditing
    };
};
