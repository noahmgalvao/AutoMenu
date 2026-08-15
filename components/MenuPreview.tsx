import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddedImage, ElementStyle, Product, MenuStyle, SortOption } from '../types';
import { AlertTriangle, BringToFront, Copy, CopyPlus, EyeOff, Paintbrush, Clipboard, Plus, Scissors, SendToBack, Trash2, ListChecks } from 'lucide-react';
import { A4_HEIGHT_PX, calculatePagination, FREE_TEXT_PREFIX, SAFETY_BUFFER, type PageLayout } from '../utils/menuPagination';
import { isPristineNewCategory, isPristineNewProduct } from '../utils/pristineItems';
import { useMenuInteractions } from '../hooks/useMenuInteractions';
import { NUDGE_STEP, type DraftItem, type MoveDirection, type SelectionItem } from '../hooks/interactions/types';
import { MenuPage } from './MenuPage';
import { getImageLayerIndexes } from '../utils/imageLayers';
import type { FlowDirection } from '../utils/flowControls';
import { getCollisionSafeFreeTextTop } from '../hooks/interactions/freeTextMovement';
import { resolveMenuMargins } from '../utils/styleRules';

interface MenuPreviewProps {
    products: Product[];
    style: MenuStyle;
    sortOption: SortOption;
    onMoveCategory?: (category: string, direction: MoveDirection) => void;
    onMoveProduct?: (productId: string, category: string, direction: MoveDirection) => void;
    onUpdateProduct?: (id: string, field: keyof Product, value: any) => void;
    onUpdateProducts?: (updates: { id: string, field: keyof Product, value: any }[]) => void;
    onUpdateCategoryName?: (oldName: string, newName: string) => void;
    onUpdateMenuText?: (field: 'menuTitle' | 'menuSubtitle', value: string) => void;
    onCommitCategoryOrder?: (newOrder: string[]) => void;
    onCommitProductOrder?: (category: string, newOrder: string[]) => void;
    onToggleProductVisibility?: (productId: string, visible: boolean) => void;
    onAddProduct?: (category: string, productId?: string, isFreeText?: boolean, specificId?: string, initialData?: Partial<Product>, options?: { index?: number }) => void;
    onAddCategory?: (nearCategory: string, position: 'before' | 'after') => void;
    onDeleteProduct?: (productId: string) => void;
    onStyleUpdate?: React.Dispatch<React.SetStateAction<MenuStyle>>;
    externalAction?: { type: string, id: number };
    onSelectionChange?: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }) => void;
    onSelectedItemsChange?: (items: SelectionItem[]) => void;
    selection?: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    scale?: number;
    splitCategoryAcrossPages?: boolean;
    productsCanChangeCategory?: boolean;
}

type ObjectSelectionItem = SelectionItem & { type: 'product' | 'category' | 'freeText' | 'addedImage' };
type CanvasContextMenuItem = ObjectSelectionItem | { type: 'menuTitle'; id: 'menuTitle' };

type ClipboardItem =
    | { type: 'product'; product: Product }
    | { type: 'freeText'; product: Product }
    | { type: 'category'; category: string; products: Product[] }
    | { type: 'addedImage'; image: AddedImage };

type FormatClipboard =
    | { type: 'category'; style: ElementStyle }
    | { type: 'product'; styles: Pick<MenuStyle['elementStyles'], 'productName' | 'productPrice' | 'productDescription'> }
    | { type: 'freeText'; style: ElementStyle }
    | { type: 'addedImage'; width: number };

type CanvasClipboard =
    | { mode: 'items'; items: ClipboardItem[] }
    | { mode: 'format'; format: FormatClipboard };

type NativeClipboardPayload =
    | { type: 'text'; text: string }
    | { type: 'image'; blob: Blob };

type ObjectMenuState = {
    x: number;
    y: number;
    item: CanvasContextMenuItem | null;
};

type MarqueeRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type MarqueeDragState = {
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
    additive: boolean;
    initialItems: ObjectSelectionItem[];
};

type FlowPosition = {
    pageIndex: number;
    columnIndex: number;
    rowIndex: number;
    subColumnIndex: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getDirectionBetween = (from: FlowPosition, to: FlowPosition): FlowDirection => {
    if (from.pageIndex !== to.pageIndex) return to.pageIndex > from.pageIndex ? 'right' : 'left';
    if (from.columnIndex !== to.columnIndex) return to.columnIndex > from.columnIndex ? 'right' : 'left';
    if (from.rowIndex === to.rowIndex && from.subColumnIndex !== to.subColumnIndex) {
        return to.subColumnIndex > from.subColumnIndex ? 'right' : 'left';
    }
    return to.rowIndex >= from.rowIndex ? 'bottom' : 'top';
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
});

// --- FONT LOADER COMPONENT ---
const DynamicFontLoader: React.FC<{ fonts: string[] }> = ({ fonts }) => {
    useEffect(() => {
        const uniqueFonts = Array.from(new Set(fonts)).filter(f => f && f !== 'Inherit');
        uniqueFonts.forEach((font: string) => {
            const linkId = `font-loader-${font.replace(/\s+/g, '-').toLowerCase()}`;
            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}&display=swap`;
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
        });
    }, [fonts]);
    return null;
};

export const MenuPreview: React.FC<MenuPreviewProps> = (props) => {
    // 1. Hook for all interactions and state
    const handlers = useMenuInteractions(props);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const previewRootRef = useRef<HTMLDivElement | null>(null);
    const objectMenuRef = useRef<HTMLDivElement | null>(null);
    const lastCanvasPointRef = useRef<{ x: number; y: number } | null>(null);
    const handledExternalActionIdRef = useRef<number | null>(null);
    const marqueeDragRef = useRef<MarqueeDragState | null>(null);
    const suppressMarqueeClickRef = useRef(false);
    const [clipboardVersion, setClipboardVersion] = useState(0);
    const [nativeClipboardAvailable, setNativeClipboardAvailable] = useState(false);
    const [objectMenu, setObjectMenu] = useState<ObjectMenuState | null>(null);
    const [objectMenuPosition, setObjectMenuPosition] = useState<{ left: number; top: number } | null>(null);
    const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
    const {
        products, style, onAddProduct, onStyleUpdate, onDeleteProduct, onToggleProductVisibility, onSelectedItemsChange
    } = props;

    useEffect(() => {
        onSelectedItemsChange?.(handlers.selectedItems || []);
    }, [handlers.selectedItems, onSelectedItemsChange]);

    useEffect(() => {
        if (!objectMenu) return;

        const closeMenuIfOutside = (event: PointerEvent | MouseEvent) => {
            const target = event.target as Node | null;
            if (target && objectMenuRef.current?.contains(target)) return;
            setObjectMenu(null);
        };

        document.addEventListener('pointerdown', closeMenuIfOutside, true);
        document.addEventListener('contextmenu', closeMenuIfOutside, true);
        return () => {
            document.removeEventListener('pointerdown', closeMenuIfOutside, true);
            document.removeEventListener('contextmenu', closeMenuIfOutside, true);
        };
    }, [objectMenu]);

    React.useLayoutEffect(() => {
        if (!objectMenu) return;

        const reposition = () => {
            const menu = objectMenuRef.current;
            if (!menu) return;

            const rect = menu.getBoundingClientRect();
            const nextPosition = {
                left: clamp(objectMenu.x, 8, Math.max(8, window.innerWidth - rect.width - 8)),
                top: clamp(objectMenu.y, 8, Math.max(8, window.innerHeight - rect.height - 8)),
            };
            setObjectMenuPosition((current) => (
                current?.left === nextPosition.left && current?.top === nextPosition.top
                    ? current
                    : nextPosition
            ));
        };

        reposition();
        const resizeObserver = new ResizeObserver(reposition);
        if (objectMenuRef.current) resizeObserver.observe(objectMenuRef.current);
        window.addEventListener('resize', reposition);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', reposition);
        };
    }, [objectMenu]);

    // 2. Add wrapper handlers for clicking actions that need direct props access
    // This allows MenuItem to call handlers.handleAddClick
    (handlers as any).handleAddClick = (e: React.MouseEvent, category: string, isCategoryAdd: boolean, position: 'before' | 'after', itemId?: string) => {
        e.stopPropagation();
        if (isCategoryAdd) {
            props.onAddCategory?.(category, position);
        } else {
            const categoryProducts = handlers.groupedProducts[category] || [];
            const anchorIndex = itemId
                ? categoryProducts.findIndex((product: Product) => product.id === itemId)
                : -1;
            const insertIndex = anchorIndex === -1
                ? categoryProducts.length
                : anchorIndex + (position === 'after' ? 1 : 0);
            props.onAddProduct?.(category, undefined, false, undefined, undefined, { index: insertIndex });
        }
    };

    // 3. Font Loading
    const usedFonts = useMemo(() => {
        const fonts = new Set<string>();
        if (style.fontFamily) fonts.add(style.fontFamily);
        Object.values(style.elementStyles || {}).forEach((es: any) => {
            if (es && es.fontFamily) fonts.add(es.fontFamily);
        });
        return Array.from(fonts);
    }, [style]);

    // 4. Pagination
    const basePages = useMemo(() => {
        return calculatePagination(
            products,
            style,
            handlers.groupedProducts,
            handlers.sortedCategories,
            handlers.liveCategoryPageAssignments
                || (Object.keys(style.categoryPlacements || {}).length > 0 ? style.categoryPlacements : null),
            { splitCategoryAcrossPages: props.splitCategoryAcrossPages }
        );
    }, [products, props.splitCategoryAcrossPages, style, handlers.groupedProducts, handlers.sortedCategories, handlers.liveCategoryPageAssignments]);

    const pages = useMemo(() => {
        const columnCount = style.categoryColumnCount || 1;
        const result: PageLayout[] = [...basePages];

        [...(style.blankPages || [])]
            .sort((left, right) => left.index - right.index)
            .forEach((blankPage) => {
                const hasImageOnBlankPage = (style.addedImages || []).some((image) => (image.pageIndex || 0) === blankPage.index);
                if (!hasImageOnBlankPage && blankPage.index < result.length) return;
                const insertIndex = Math.max(0, Math.min(blankPage.index, result.length));
                result.splice(insertIndex, 0, {
                    blankPageId: blankPage.id,
                    mainHeader: null,
                    columns: Array.from({ length: columnCount }, (_, columnIndex) => ({
                        columnIndex,
                        chunks: [],
                        estimatedHeight: 0,
                    })),
                    flatItems: [],
                    columnCount,
                });
            });

        const requiredBackgroundPageCount = (style.pageBackgrounds || []).reduce(
            (pageCount, background) => Math.max(pageCount, background.pageIndex + 1),
            1,
        );
        while (result.length < requiredBackgroundPageCount) {
            result.push({
                mainHeader: null,
                columns: Array.from({ length: columnCount }, (_, columnIndex) => ({
                    columnIndex,
                    chunks: [],
                    estimatedHeight: 0,
                })),
                flatItems: [],
                columnCount,
            });
        }

        return result;
    }, [basePages, style.addedImages, style.blankPages, style.categoryColumnCount, style.pageBackgrounds]);

    const getFlowControlDirections = useMemo(() => {
        const categoryPositions = new Map<string, FlowPosition>();
        const productPositions = new Map<string, FlowPosition>();

        pages.forEach((page, pageIndex) => {
            page.columns.forEach((column) => {
                let rowIndex = 0;
                column.chunks.forEach((chunk) => {
                    chunk.items.forEach((item) => {
                        if (item.type === 'category-header') {
                            categoryPositions.set(item.data, {
                                pageIndex,
                                columnIndex: column.columnIndex,
                                rowIndex,
                                subColumnIndex: 0,
                            });
                        } else if (item.type === 'product-item') {
                            productPositions.set(item.data.id, {
                                pageIndex,
                                columnIndex: column.columnIndex,
                                rowIndex,
                                subColumnIndex: 0,
                            });
                        } else if (item.type === 'product-row') {
                            item.data.forEach((product, productColumnIndex) => {
                                productPositions.set(product.id, {
                                    pageIndex,
                                    columnIndex: column.columnIndex,
                                    rowIndex,
                                    subColumnIndex: productColumnIndex,
                                });
                            });
                        }
                        rowIndex += 1;
                    });
                });
            });
        });

        return (type: 'category' | 'product' | 'freeText', id: string) => {
            if (type === 'category') {
                const current = categoryPositions.get(id);
                const categoryOrder = handlers.sortedCategories.filter((category: string) => categoryPositions.has(category));
                const index = categoryOrder.indexOf(id);
                const previous = index > 0 ? categoryPositions.get(categoryOrder[index - 1]) : undefined;
                const next = index >= 0 ? categoryPositions.get(categoryOrder[index + 1]) : undefined;

                return {
                    before: current && previous ? getDirectionBetween(current, previous) : 'top',
                    after: current && next ? getDirectionBetween(current, next) : 'bottom',
                };
            }

            const current = productPositions.get(id);
            const product = products.find((candidate) => candidate.id === id);
            const productOrder = product
                ? (handlers.groupedProducts[product.category] || [])
                    .map((candidate: Product) => candidate.id)
                    .filter((productId: string) => productPositions.has(productId))
                : [];
            const index = productOrder.indexOf(id);
            const previous = index > 0 ? productPositions.get(productOrder[index - 1]) : undefined;
            const next = index >= 0 ? productPositions.get(productOrder[index + 1]) : undefined;
            const productColumnCount = style.columnCount || 1;
            const expectedAfter: FlowDirection = current && productColumnCount > 1 && current.subColumnIndex < productColumnCount - 1
                ? 'right'
                : 'bottom';

            return {
                before: current && previous ? getDirectionBetween(current, previous) : 'top',
                after: current && next ? getDirectionBetween(current, next) : expectedAfter,
            };
        };
    }, [handlers.groupedProducts, handlers.sortedCategories, pages, products, style.columnCount]);

    (handlers as any).getFlowControlDirections = getFlowControlDirections;

    (handlers as any).handleInlineStyleChange = (target: any, newStyle: ElementStyle) => {
        if (target.type === 'freeText') {
            const currentProduct = products.find(product => product.id === target.id);
            const fontSizeReduced = Number(newStyle.fontSize) > 0
                && Number(currentProduct?.styles?.fontSize) > 0
                && Number(newStyle.fontSize) < Number(currentProduct?.styles?.fontSize);
            props.onUpdateProduct?.(target.id, 'styles', newStyle);
            if (fontSizeReduced) {
                onStyleUpdate?.(prev => ({ ...prev, pageBreaks: [] }));
            }
            return;
        }

        const elementType: keyof MenuStyle['elementStyles'] =
            target.type === 'pageNumber' ? 'pageNumber' :
            target.type === 'category' ? 'category' :
                target.type === 'menuTitle' ? 'menuTitle' :
                    target.type === 'menuSubtitle' ? 'menuSubtitle' :
                        target.field === 'price' ? 'productPrice' :
                            target.field === 'description' ? 'productDescription' :
                                'productName';

        onStyleUpdate?.(prev => {
            const previousStyle = prev.elementStyles[elementType] || {};
            const colorChanged = newStyle.color !== previousStyle.color;
            const fontSizeReduced = target.type !== 'pageNumber'
                && Number(newStyle.fontSize) > 0
                && Number(previousStyle.fontSize) > 0
                && Number(newStyle.fontSize) < Number(previousStyle.fontSize);
            return {
                ...prev,
                elementStyles: { ...prev.elementStyles, [elementType]: newStyle },
                elementColorOverrides: colorChanged
                    ? { ...(prev.elementColorOverrides || {}), [elementType]: true }
                    : prev.elementColorOverrides,
                pageBreaks: fontSizeReduced ? [] : prev.pageBreaks,
                name: 'Custom',
            };
        });
    };

    const selectedPageIndexes = useMemo(() => (
        (handlers.selectedItems || [])
            .filter((item: any) => item.type === 'page')
            .map((item: any) => Number(item.id))
            .filter((index: number) => Number.isFinite(index) && index >= 0 && index < pages.length)
    ), [handlers.selectedItems, pages.length]);

    const getPageIndexesForDeletion = useCallback(() => {
        if (handlers.pageToDelete === null) return [];
        if (selectedPageIndexes.length > 1 && selectedPageIndexes.includes(handlers.pageToDelete)) {
            return Array.from(new Set(selectedPageIndexes)).sort((left, right) => left - right);
        }
        return [handlers.pageToDelete].filter((index) => index >= 0 && index < pages.length);
    }, [handlers.pageToDelete, pages.length, selectedPageIndexes]);

    // 5. Page Management Handlers
    const handleAddPage = (index: number, position: 'before' | 'after' = 'after') => {
        const insertIndex = position === 'after' ? index + 1 : index;

        onStyleUpdate?.(prev => {
            const blankPages = (prev.blankPages || []).map((blankPage) => (
                blankPage.index >= insertIndex
                    ? { ...blankPage, index: blankPage.index + 1 }
                    : blankPage
            ));

            return {
                ...prev,
                blankPages: [...blankPages, {
                    id: crypto.randomUUID(),
                    index: insertIndex,
                    fixedPosition: insertIndex < basePages.length,
                }],
                name: 'Custom',
            };
        });

        handlers.setSelectedPageIndex(insertIndex);
        handlers.handleSelection('page', String(insertIndex));
        window.setTimeout(() => {
            document
                .querySelector<HTMLElement>(`[data-page-index="${insertIndex}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 80);
    };

    const handleDeletePage = useCallback(() => {
        const pageIndexesToDelete = getPageIndexesForDeletion();
        if (pageIndexesToDelete.length === 0) return;

        const blankPageIdsToDelete = new Set<string>();
        const prodIdsToHide = new Set<string>();
        const freeTextIdsToDelete = new Set<string>();
        const categoriesOnDeletedPages = new Set<string>();

        pageIndexesToDelete.forEach((pageIndex) => {
            const pageToDelete = pages[pageIndex];
            if (!pageToDelete) return;

            if (pageToDelete.blankPageId) {
                blankPageIdsToDelete.add(pageToDelete.blankPageId);
                return;
            }

            (pageToDelete.flatItems || []).forEach((item: any) => {
                if (item.category) categoriesOnDeletedPages.add(item.category);

                if (item.type === 'product-item' || item.type === 'product-row') {
                    const data = Array.isArray(item.data) ? item.data : [item.data];
                    data.forEach((p: Product) => {
                        if (p.isFreeText) freeTextIdsToDelete.add(p.id);
                        else prodIdsToHide.add(p.id);
                    });
                }
            });
        });

        if (onStyleUpdate) {
            onStyleUpdate(prev => {
                const currentHidden = new Set(prev.hiddenProductIds || []);
                prodIdsToHide.forEach(id => currentHidden.add(id));

                const newPageBreaks = (prev.pageBreaks || []).filter(c => !categoriesOnDeletedPages.has(c));
                const blankPages = (prev.blankPages || [])
                    .filter((blankPage) => !blankPageIdsToDelete.has(blankPage.id))
                    .map((blankPage) => {
                        const deletedBefore = pageIndexesToDelete.filter((pageIndex) => pageIndex < blankPage.index).length;
                        return deletedBefore > 0
                            ? { ...blankPage, index: Math.max(0, blankPage.index - deletedBefore) }
                            : blankPage;
                    });

                return { ...prev, hiddenProductIds: Array.from(currentHidden), pageBreaks: newPageBreaks, blankPages, name: 'Custom' };
            });
        }

        freeTextIdsToDelete.forEach(id => onDeleteProduct?.(id));

        handlers.setShowDeletePageConfirm(false);
        handlers.setPageToDelete(null);
        handlers.handleSelection(null, null);
    }, [getPageIndexesForDeletion, handlers, onDeleteProduct, onStyleUpdate, pages]);

    const handleDeleteSelectedCanvasItems = useCallback(() => {
        const selectedItems = handlers.selectedItems || [];
        if (selectedItems.length === 0) return false;

        const pageItems = selectedItems.filter((item: any) => item.type === 'page');
        if (pageItems.length > 0) {
            const firstPageIndex = Number(pageItems[0].id);
            if (Number.isFinite(firstPageIndex)) {
                handlers.setPageToDelete(firstPageIndex);
                handlers.setShowDeletePageConfirm(true);
                return true;
            }
        }

        const productIdsToHide = new Set<string>();
        const categoriesToHide = new Set<string>();
        const productIdsToDelete = new Set<string>();
        const categoriesToDelete = new Set<string>();
        const freeTextIdsToDelete = new Set<string>();
        const addedImageIdsToDelete = new Set<string>();

        selectedItems.forEach((item: any) => {
            if (item.type === 'category') {
                if (isPristineNewCategory(item.id, products)) categoriesToDelete.add(item.id);
                else categoriesToHide.add(item.id);
                return;
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find(candidate => candidate.id === item.id);
                if (product?.isFreeText || item.type === 'freeText') freeTextIdsToDelete.add(item.id);
                else if (isPristineNewProduct(product)) productIdsToDelete.add(item.id);
                else productIdsToHide.add(item.id);
                return;
            }

            if (item.type === 'addedImage') {
                addedImageIdsToDelete.add(item.id);
            }
        });

        categoriesToDelete.forEach(category => {
            (handlers.groupedProducts[category] || products.filter(product => product.category === category)).forEach((product: Product) => {
                productIdsToDelete.add(product.id);
            });
        });

        if (productIdsToHide.size === 0 && categoriesToHide.size === 0 && productIdsToDelete.size === 0 && categoriesToDelete.size === 0 && freeTextIdsToDelete.size === 0 && addedImageIdsToDelete.size === 0) {
            return false;
        }

        onStyleUpdate?.(prev => {
            const currentHidden = new Set(prev.hiddenProductIds || []);
            productIdsToHide.forEach(productId => currentHidden.add(productId));
            categoriesToHide.forEach(category => {
                (handlers.groupedProducts[category] || []).forEach((product: Product) => currentHidden.add(product.id));
            });
            productIdsToDelete.forEach(productId => currentHidden.delete(productId));

            const nextProductOrder = { ...(prev.customProductOrder || {}) };
            Object.keys(nextProductOrder).forEach(category => {
                if (categoriesToDelete.has(category)) {
                    delete nextProductOrder[category];
                    return;
                }
                nextProductOrder[category] = nextProductOrder[category].filter(productId => !productIdsToDelete.has(productId));
            });

            return {
                ...prev,
                hiddenProductIds: Array.from(currentHidden),
                customCategoryOrder: (prev.customCategoryOrder || []).filter(category => !categoriesToDelete.has(category)),
                customProductOrder: nextProductOrder,
                addedImages: addedImageIdsToDelete.size > 0
                    ? (prev.addedImages || []).filter((img) => !addedImageIdsToDelete.has(img.id))
                    : prev.addedImages,
                name: 'Custom'
            };
        });

        productIdsToDelete.forEach(productId => onDeleteProduct?.(productId));
        freeTextIdsToDelete.forEach(productId => onDeleteProduct?.(productId));
        handlers.handleSelection(null, null);
        return true;
    }, [handlers, onDeleteProduct, onStyleUpdate, products]);

    const isObjectItem = (item: SelectionItem): item is ObjectSelectionItem =>
        item.type === 'product' ||
        item.type === 'category' ||
        item.type === 'freeText' ||
        item.type === 'addedImage';

    const getActiveObjectItems = useCallback((targetItem?: ObjectSelectionItem | null): ObjectSelectionItem[] => {
        const objectItems = (handlers.selectedItems || []).filter(isObjectItem);
        if (!targetItem) return objectItems;

        const isTargetSelected = objectItems.some((item) => item.type === targetItem.type && item.id === targetItem.id);
        return isTargetSelected && objectItems.length > 1 ? objectItems : [targetItem];
    }, [handlers.selectedItems]);

    const getObjectElement = useCallback((item: ObjectSelectionItem): HTMLElement | null => {
        if (item.type === 'category') return document.getElementById(`category-header-${item.id}`);
        if (item.type === 'product' || item.type === 'freeText') return document.getElementById(`product-container-${item.id}`);
        return Array.from(document.querySelectorAll<HTMLElement>('[data-added-image-id]'))
            .find((element) => element.dataset.addedImageId === item.id) || null;
    }, []);

    const getMarqueeItems = useCallback((rect: MarqueeRect): ObjectSelectionItem[] => {
        const root = previewRootRef.current;
        if (!root) return [];

        const right = rect.left + rect.width;
        const bottom = rect.top + rect.height;
        const productsById = new Map(products.map((product) => [product.id, product]));
        const seen = new Set<string>();

        return Array.from(root.querySelectorAll<HTMLElement>(
            '[data-category-id], [data-drag-type="product"][data-drag-id], [data-added-image-id]'
        )).reduce<ObjectSelectionItem[]>((items, element) => {
            if (!element.isConnected || element.getClientRects().length === 0) return items;

            const elementRect = element.getBoundingClientRect();
            const intersects = elementRect.right >= rect.left
                && elementRect.left <= right
                && elementRect.bottom >= rect.top
                && elementRect.top <= bottom;
            if (!intersects) return items;

            let item: ObjectSelectionItem | null = null;
            const addedImageId = element.dataset.addedImageId;
            const categoryId = element.dataset.categoryId;
            const productId = element.dataset.dragType === 'product' ? element.dataset.dragId : undefined;

            if (addedImageId) {
                item = { type: 'addedImage', id: addedImageId };
            } else if (categoryId) {
                item = { type: 'category', id: categoryId };
            } else if (productId) {
                const product = productsById.get(productId);
                if (product) item = { type: product.isFreeText ? 'freeText' : 'product', id: productId };
            }

            if (!item) return items;
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return items;
            seen.add(key);
            items.push(item);
            return items;
        }, []);
    }, [products]);

    const updateMarqueeSelection = useCallback((rect: MarqueeRect, drag: MarqueeDragState) => {
        const intersectedItems = getMarqueeItems(rect);
        const baseItems = drag.additive ? drag.initialItems : [];
        const combinedItems = [...baseItems, ...intersectedItems];
        const objectMode = combinedItems.some((item) => item.type !== 'category');
        const candidates = objectMode
            ? combinedItems.filter((item) => item.type !== 'category')
            : combinedItems;
        const seen = new Set<string>();
        const nextItems = candidates.filter((item) => {
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        handlers.replaceSelectedItems(nextItems);
        handlers.setEditingId(null);
    }, [getMarqueeItems, handlers]);

    const handlePreviewPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        document.body.dataset.automenuDeleteContext = 'canvas';
        const target = event.target as HTMLElement | null;
        const pageElement = target?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
        if (pageElement) {
            lastCanvasPointRef.current = { x: event.clientX, y: event.clientY };
        }

        if (
            !pageElement
            || event.pointerType !== 'mouse'
            || event.button !== 0
            || Boolean(document.body.dataset.automenuImageInteraction)
            || target?.closest(
                '[data-drag-type], [data-added-image-drag="true"], #menu-title-text, #menu-subtitle-text, button, input, textarea, select, [contenteditable="true"], [data-drag-ignore="true"], [data-inline-format-toolbar="true"]'
            )
        ) {
            return;
        }

        const additive = event.ctrlKey || event.metaKey || event.shiftKey;
        marqueeDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            currentY: event.clientY,
            isSelecting: false,
            additive,
            initialItems: additive ? (handlers.selectedItems || []).filter(isObjectItem) : [],
        };
    };

    const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = marqueeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (document.body.dataset.automenuImageInteraction) {
            marqueeDragRef.current = null;
            setMarqueeRect(null);
            return;
        }

        drag.currentX = event.clientX;
        drag.currentY = event.clientY;
        if (!drag.isSelecting) {
            if (Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY) < 5) return;
            drag.isSelecting = true;
            suppressMarqueeClickRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
        }

        const rect = {
            left: Math.min(drag.startX, drag.currentX),
            top: Math.min(drag.startY, drag.currentY),
            width: Math.abs(drag.currentX - drag.startX),
            height: Math.abs(drag.currentY - drag.startY),
        };
        setMarqueeRect(rect);
        updateMarqueeSelection(rect, drag);
        event.preventDefault();
        event.stopPropagation();
    };

    const handlePreviewPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = marqueeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (drag.isSelecting) {
            event.preventDefault();
            event.stopPropagation();
            window.setTimeout(() => {
                suppressMarqueeClickRef.current = false;
            }, 0);
        }

        marqueeDragRef.current = null;
        setMarqueeRect(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const getFreeTextPlacementFromPoint = useCallback((point: { x: number; y: number } | null): DraftItem | null => {
        const pageEls = Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]'));
        if (pageEls.length === 0) return null;

        const getRectDistance = (rect: DOMRect) => {
            if (!point) return 0;
            const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
            const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
            return dx + dy;
        };

        const pageEl = point
            ? pageEls.find((element) => {
                const rect = element.getBoundingClientRect();
                return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
            }) || pageEls.reduce((best, element) => (
                getRectDistance(element.getBoundingClientRect()) < getRectDistance(best.getBoundingClientRect()) ? element : best
            ), pageEls[0])
            : pageEls[0];

        const pageRect = pageEl.getBoundingClientRect();
        const currentScale = (typeof props.scale === 'number' && props.scale > 0) ? props.scale : 1;
        const pageIndex = Number(pageEl.dataset.pageIndex ?? 0);
        const menuMargins = resolveMenuMargins(style);
        const targetX = point?.x ?? pageRect.left + menuMargins.left;
        let clickY = clamp(((point?.y ?? pageRect.top + menuMargins.top) - pageRect.top) / currentScale, 0, A4_HEIGHT_PX);

        const columnEls = Array.from(
            pageEl.querySelectorAll<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]')
        );
        const clickedColumnEl = columnEls.find((columnEl) => {
            const rect = columnEl.getBoundingClientRect();
            return targetX >= rect.left && targetX <= rect.right;
        }) || columnEls.reduce<HTMLElement | null>((best, columnEl) => {
            if (!best) return columnEl;
            const rect = columnEl.getBoundingClientRect();
            const bestRect = best.getBoundingClientRect();
            const distance = Math.abs(targetX - (rect.left + rect.width / 2));
            const bestDistance = Math.abs(targetX - (bestRect.left + bestRect.width / 2));
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
        const columnRect = clickedColumnEl?.getBoundingClientRect();
        const safeClientTop = getCollisionSafeFreeTextTop({
            root: pageEl,
            desiredTop: pageRect.top + (clickY * currentScale),
            height: 40 * currentScale,
            pointerY: point?.y ?? pageRect.top + (clickY * currentScale),
            minTop: columnRect?.top ?? pageRect.top + (menuMargins.top * currentScale),
            maxBottom: pageRect.bottom - ((menuMargins.bottom + SAFETY_BUFFER) * currentScale),
            minLeft: columnRect?.left,
            maxRight: columnRect?.right,
        });
        if (safeClientTop === null) return null;
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

        return { pageIndex, columnIndex, top: clickY, floorId, floorBottom, ceilingId, ceilingTop };
    }, [props.scale, style.margins, style.pagePadding]);

    const getFreeTextPlacementBelowSelection = useCallback((): DraftItem | null => {
        const selectedObjects = (handlers.selectedItems || []).filter(isObjectItem);
        let fallbackPlacement: DraftItem | null = null;

        for (const item of selectedObjects) {
            const element = getObjectElement(item);
            const pageEl = element?.closest('[data-menu-print-page="true"][data-page-index]') as HTMLElement | null;
            if (!element || !pageEl) continue;

            const rect = element.getBoundingClientRect();
            const pageRect = pageEl.getBoundingClientRect();
            const placement = getFreeTextPlacementFromPoint({
                x: rect.left + rect.width / 2,
                y: Math.min(pageRect.bottom - 4, rect.bottom + 8),
            });
            if (!placement) continue;
            if (!fallbackPlacement) fallbackPlacement = placement;

            if (item.type === 'category') {
                return { ...placement, targetCategory: item.id, targetProductId: null };
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find((candidate) => candidate.id === item.id);
                if (product) {
                    return { ...placement, targetCategory: product.category, targetProductId: product.id };
                }
            }
        }

        return fallbackPlacement;
    }, [getFreeTextPlacementFromPoint, getObjectElement, handlers.selectedItems, products]);

    const getLastFreeTextPlacement = useCallback((): DraftItem | null => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]'));
        if (pages.length === 0) return null;

        const lastPage = pages[pages.length - 1];
        const pageRect = lastPage.getBoundingClientRect();
        const currentScale = (typeof props.scale === 'number' && props.scale > 0) ? props.scale : 1;

        const columns = Array.from(lastPage.querySelectorAll<HTMLElement>('[data-drag-column-container="category"][data-drag-column-index]'));
        const lastColumn = columns[columns.length - 1] || lastPage;
        const columnRect = lastColumn.getBoundingClientRect();

        const elements = Array.from(lastColumn.querySelectorAll<HTMLElement>('[id^="product-container-"], [id^="category-header-"]'));

        let targetY = resolveMenuMargins(style).top;
        if (elements.length > 0) {
            const lastElement = elements[elements.length - 1];
            const rect = lastElement.getBoundingClientRect();
            targetY = ((rect.bottom - pageRect.top) / currentScale) + NUDGE_STEP;
        }

        return getFreeTextPlacementFromPoint({
            x: columnRect.left + Math.min(24, columnRect.width / 2),
            y: pageRect.top + (targetY * currentScale),
        });
    }, [getFreeTextPlacementFromPoint, props.scale, style.margins, style.pagePadding]);

    const getFreeTextPastePlacement = useCallback((
        menuPoint?: { x: number; y: number } | null,
        targetItem?: ObjectSelectionItem | null
    ) => {
        const placement = (menuPoint ? getFreeTextPlacementFromPoint(menuPoint) : null)
            || getFreeTextPlacementBelowSelection()
            || getFreeTextPlacementFromPoint(lastCanvasPointRef.current)
            || getLastFreeTextPlacement();
        if (!placement || !targetItem) return placement;

        if (targetItem.type === 'category') {
            return { ...placement, targetCategory: targetItem.id, targetProductId: null };
        }

        if (targetItem.type === 'product' || targetItem.type === 'freeText') {
            const product = products.find((candidate) => candidate.id === targetItem.id);
            if (product) {
                return { ...placement, targetCategory: product.category, targetProductId: product.id };
            }
        }

        return placement;
    }, [getLastFreeTextPlacement, getFreeTextPlacementBelowSelection, getFreeTextPlacementFromPoint, products]);

    const getImagePastePoint = useCallback((menuPoint?: { x: number; y: number } | null) => {
        if (menuPoint) return menuPoint;

        const selectedObjects = (handlers.selectedItems || []).filter(isObjectItem);
        for (const item of selectedObjects) {
            const element = getObjectElement(item);
            const pageEl = element?.closest('[data-menu-print-page="true"][data-page-index]') as HTMLElement | null;
            if (!element || !pageEl) continue;

            const rect = element.getBoundingClientRect();
            const pageRect = pageEl.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2,
                y: Math.min(pageRect.bottom - 4, rect.bottom + 12),
            };
        }

        if (lastCanvasPointRef.current) return lastCanvasPointRef.current;

        const firstPage = document.querySelector<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
        const firstRect = firstPage?.getBoundingClientRect();
        return firstRect
            ? {
                x: firstRect.left + resolveMenuMargins(style).left,
                y: firstRect.top + resolveMenuMargins(style).top,
            }
            : null;
    }, [getObjectElement, handlers.selectedItems, style.margins, style.pagePadding]);

    const addNativeClipboardImage = useCallback(async (blob: Blob, point?: { x: number; y: number } | null) => {
        if (!onStyleUpdate) return false;

        const dataUrl = await blobToDataUrl(blob);
        const pageEls = Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]'));
        if (pageEls.length === 0) return false;

        const targetPoint = getImagePastePoint(point);
        const pageEl = targetPoint
            ? pageEls.find((element) => {
                const rect = element.getBoundingClientRect();
                return targetPoint.x >= rect.left && targetPoint.x <= rect.right && targetPoint.y >= rect.top && targetPoint.y <= rect.bottom;
            }) || pageEls[0]
            : pageEls[0];
        const pageRect = pageEl.getBoundingClientRect();
        const currentScale = (typeof props.scale === 'number' && props.scale > 0) ? props.scale : 1;
        const width = 300;
        const x = clamp((((targetPoint?.x ?? pageRect.left + 100) - pageRect.left) / currentScale) - (width / 2), 0, 794 - width);
        const y = clamp((((targetPoint?.y ?? pageRect.top + 100) - pageRect.top) / currentScale), 0, A4_HEIGHT_PX - 120);
        const newId = crypto.randomUUID();

        onStyleUpdate((prev) => {
            const images = prev.addedImages || [];
            const maxZ = Math.max(40, ...images.map((image) => image.zIndex ?? 11));
            return {
                ...prev,
                addedImages: [
                    ...images,
                    {
                        id: newId,
                        url: dataUrl,
                        assetId: null,
                        x,
                        y,
                        width,
                        pageIndex: Number(pageEl.dataset.pageIndex ?? 0),
                        zIndex: maxZ + 1,
                    },
                ],
                name: 'Custom',
            };
        });

        handlers.handleSelection('addedImage', newId);
        return true;
    }, [getImagePastePoint, handlers, onStyleUpdate, props.scale]);

    const readNativeClipboardPayload = useCallback(async (): Promise<NativeClipboardPayload | null> => {
        const clipboard = navigator.clipboard as (Clipboard & { read?: () => Promise<globalThis.ClipboardItem[]> }) | undefined;
        if (!clipboard) return null;

        try {
            const items = clipboard.read ? await clipboard.read() : [];
            for (const item of items) {
                const imageType = item.types.find((type) => type.startsWith('image/'));
                if (imageType) return { type: 'image', blob: await item.getType(imageType) };
            }
        } catch {
            // Browser may only allow text reads without extra permission.
        }

        try {
            const text = await clipboard.readText();
            if (text.trim()) return { type: 'text', text };
        } catch {
            return null;
        }

        return null;
    }, []);

    useEffect(() => {
        if (!objectMenu) {
            setNativeClipboardAvailable(false);
            return;
        }

        if (objectMenu.item) {
            setNativeClipboardAvailable(Boolean(navigator.clipboard?.readText || (navigator.clipboard as any)?.read));
            return;
        }

        let cancelled = false;
        void readNativeClipboardPayload().then((payload) => {
            if (!cancelled) setNativeClipboardAvailable(Boolean(payload));
        });

        return () => {
            cancelled = true;
        };
    }, [objectMenu, readNativeClipboardPayload]);

    const getUniqueCategoryName = useCallback((baseName: string) => {
        const existing = new Set(products.filter((product) => !product.isFreeText).map((product) => product.category));
        let candidate = `${baseName} copia`;
        let index = 2;
        while (existing.has(candidate)) {
            candidate = `${baseName} copia ${index}`;
            index += 1;
        }
        return candidate;
    }, [products]);

    const getCategoryOrder = useCallback(() => {
        const currentOrder = style.customCategoryOrder?.length
            ? [...style.customCategoryOrder]
            : [...handlers.sortedCategories];
        handlers.sortedCategories.forEach((category: string) => {
            if (!currentOrder.includes(category)) currentOrder.push(category);
        });
        return currentOrder;
    }, [handlers.sortedCategories, style.customCategoryOrder]);

    const getProductInitialData = (product: Product, categoryId?: string | null): Partial<Product> => ({
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image || '',
        imageAssetId: product.imageAssetId || null,
        categoryId: categoryId ?? product.categoryId ?? null,
    });

    const buildClipboardItems = useCallback((items: ObjectSelectionItem[]): ClipboardItem[] => (
        items.flatMap((item): ClipboardItem[] => {
            if (item.type === 'category') {
                return [{
                    type: 'category',
                    category: item.id,
                    products: products.filter((product) => !product.isFreeText && product.category === item.id),
                }];
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find((candidate) => candidate.id === item.id);
                if (!product) return [];
                return [{ type: product.isFreeText ? 'freeText' : 'product', product }];
            }

            const image = (style.addedImages || []).find((candidate) => candidate.id === item.id);
            return image ? [{ type: 'addedImage', image }] : [];
        })
    ), [products, style.addedImages]);

    const copyItems = useCallback((items: ObjectSelectionItem[]) => {
        const clipboardItems = buildClipboardItems(items);
        if (clipboardItems.length === 0) return false;
        clipboardRef.current = { mode: 'items', items: clipboardItems };
        setClipboardVersion((version) => version + 1);
        return true;
    }, [buildClipboardItems]);

    const copyFormatting = useCallback((items: ObjectSelectionItem[]) => {
        const [item] = items;
        if (!item) return false;

        if (item.type === 'category') {
            clipboardRef.current = { mode: 'format', format: { type: 'category', style: { ...(style.elementStyles?.category || {}) } } };
        } else if (item.type === 'product') {
            clipboardRef.current = {
                mode: 'format',
                format: {
                    type: 'product',
                    styles: {
                        productName: { ...(style.elementStyles?.productName || {}) },
                        productPrice: { ...(style.elementStyles?.productPrice || {}) },
                        productDescription: { ...(style.elementStyles?.productDescription || {}) },
                    },
                },
            };
        } else if (item.type === 'freeText') {
            const product = products.find((candidate) => candidate.id === item.id);
            if (!product) return false;
            clipboardRef.current = { mode: 'format', format: { type: 'freeText', style: { ...(product.styles || {}) } } };
        } else {
            const image = (style.addedImages || []).find((candidate) => candidate.id === item.id);
            if (!image) return false;
            clipboardRef.current = { mode: 'format', format: { type: 'addedImage', width: image.width } };
        }

        setClipboardVersion((version) => version + 1);
        return true;
    }, [products, style.addedImages, style.elementStyles]);

    const insertCategoryAfter = useCallback((categoryOrder: string[], anchorCategory: string, nextCategory: string) => {
        const nextOrder = categoryOrder.filter((category) => category !== nextCategory);
        const anchorIndex = nextOrder.indexOf(anchorCategory);
        nextOrder.splice(anchorIndex === -1 ? nextOrder.length : anchorIndex + 1, 0, nextCategory);
        return nextOrder;
    }, []);

    const insertFreeTextProduct = useCallback((product: Product, placement?: DraftItem | null, indexOffset: number = 0) => {
        if (!onAddProduct || !onStyleUpdate) return false;

        const newId = crypto.randomUUID();
        if (placement?.targetCategory) {
            const targetCategory = placement.targetCategory;
            const targetProducts = handlers.groupedProducts[targetCategory] || products.filter((candidate) => candidate.category === targetCategory);

            onStyleUpdate((prev) => {
                const productOrder = { ...(prev.customProductOrder || {}) };
                const currentOrder = Array.from(new Set([
                    ...(productOrder[targetCategory] || []),
                    ...targetProducts.map((candidate: Product) => candidate.id),
                ])).filter((id) => id !== newId);
                const anchorIndex = placement.targetProductId
                    ? currentOrder.indexOf(placement.targetProductId)
                    : -1;
                const insertIndex = anchorIndex === -1
                    ? currentOrder.length + indexOffset
                    : anchorIndex + 1 + indexOffset;
                currentOrder.splice(Math.max(0, Math.min(insertIndex, currentOrder.length)), 0, newId);

                return {
                    ...prev,
                    customProductOrder: { ...productOrder, [targetCategory]: currentOrder },
                    name: 'Custom',
                };
            });

            onAddProduct(targetCategory, undefined, true, newId, {
                name: product.name || 'Novo texto',
                description: product.description || '',
                price: product.price || 0,
                customMarginTop: 0,
                styles: { ...(product.styles || {}) },
            });
            return true;
        }

        const ghostCategory = `${FREE_TEXT_PREFIX}${newId}`;

        if (!placement) {
            const marginTop = (product.customMarginTop || 0) + 20 + (indexOffset * NUDGE_STEP);
            onStyleUpdate?.((prev) => {
                const currentOrder = getCategoryOrder();
                const nextOrder = insertCategoryAfter(currentOrder, product.category, ghostCategory);
                return {
                    ...prev,
                    customCategoryOrder: nextOrder,
                    customProductOrder: { ...(prev.customProductOrder || {}), [ghostCategory]: [newId] },
                    name: 'Custom',
                };
            });
            onAddProduct?.(ghostCategory, undefined, true, newId, {
                name: product.name,
                description: product.description,
                price: product.price,
                customMarginTop: marginTop,
                styles: { ...(product.styles || {}) },
            });
            return true;
        }

        const getCurrentOrder = (customOrder?: string[]) => {
            const currentOrder = customOrder && customOrder.length > 0
                ? [...customOrder]
                : [...handlers.sortedCategories];
            handlers.sortedCategories.forEach((category: string) => {
                if (!currentOrder.includes(category)) currentOrder.push(category);
            });
            return currentOrder;
        };

        const getPlacementInsertIndex = (currentOrder: string[]) => {
            if (placement.ceilingId) {
                const cProd = products.find(p => p.id === placement.ceilingId);
                const cCat = cProd ? cProd.category : (currentOrder.includes(placement.ceilingId) ? placement.ceilingId : null);
                if (cCat) {
                    const idx = currentOrder.indexOf(cCat);
                    if (idx !== -1) return idx;
                }
            } else if (placement.floorId) {
                const fProd = products.find(p => p.id === placement.floorId);
                const fCat = fProd ? fProd.category : (currentOrder.includes(placement.floorId) ? placement.floorId : null);
                if (fCat) {
                    const idx = currentOrder.indexOf(fCat);
                    if (idx !== -1) return idx + 1;
                }
            }

            return currentOrder.length;
        };

        const newItemMargin = Math.max(0, placement.top - placement.floorBottom) + (indexOffset * 46);

        onStyleUpdate(prev => {
            const currentOrder = getCurrentOrder(prev.customCategoryOrder);
            const insertIndex = getPlacementInsertIndex(currentOrder);
            currentOrder.splice(insertIndex + indexOffset, 0, ghostCategory);

            return {
                ...prev,
                customCategoryOrder: currentOrder,
                customProductOrder: { ...(prev.customProductOrder || {}), [ghostCategory]: [newId] },
                name: 'Custom',
            };
        });

        onAddProduct(ghostCategory, undefined, true, newId, {
            name: product.name || 'Novo texto',
            description: product.description || '',
            price: product.price || 0,
            customMarginTop: newItemMargin,
            styles: { ...(product.styles || {}) },
        });

        return true;
    }, [getCategoryOrder, handlers.groupedProducts, handlers.sortedCategories, insertCategoryAfter, onAddProduct, onStyleUpdate, products]);

    const addNativeClipboardText = useCallback((
        text: string,
        point?: { x: number; y: number } | null,
        targetItem?: ObjectSelectionItem | null
    ) => (
        insertFreeTextProduct({
            id: '',
            name: text.trim() || 'Novo texto',
            description: '',
            price: 0,
            category: '',
            isFreeText: true,
        }, getFreeTextPastePlacement(point, targetItem))
    ), [getFreeTextPastePlacement, insertFreeTextProduct]);

    const handleNativeClipboardPayload = useCallback(async (
        payload: NativeClipboardPayload,
        point?: { x: number; y: number } | null,
        targetItem?: ObjectSelectionItem | null
    ) => {
        if (payload.type === 'image') return addNativeClipboardImage(payload.blob, point);
        return addNativeClipboardText(payload.text, point, targetItem);
    }, [addNativeClipboardImage, addNativeClipboardText]);

    const duplicateClipboardItems = useCallback((clipboardItems: ClipboardItem[], freeTextPlacement?: DraftItem | null) => {
        if (clipboardItems.length === 0) return false;

        const addedImages = clipboardItems.filter((item): item is Extract<ClipboardItem, { type: 'addedImage' }> => item.type === 'addedImage');
        const nonImageItems = clipboardItems.filter((item) => item.type !== 'addedImage');

        if (addedImages.length > 0) {
            onStyleUpdate?.((prev) => {
                const images = prev.addedImages || [];
                const maxZ = Math.max(40, ...images.map((image) => image.zIndex ?? 11));
                const clones = addedImages.map(({ image }, index) => ({
                    ...image,
                    id: crypto.randomUUID(),
                    x: Math.min(image.x + 20, 744),
                    y: Math.min(image.y + 20, 1073),
                    zIndex: maxZ + index + 1,
                }));

                return { ...prev, addedImages: [...images, ...clones], name: 'Custom' };
            });
        }

        nonImageItems.forEach((item, index) => {
            if (item.type === 'product') {
                const newId = crypto.randomUUID();
                onAddProduct?.(item.product.category, undefined, false, newId, getProductInitialData(item.product));
                onStyleUpdate?.((prev) => {
                    const productOrder = { ...(prev.customProductOrder || {}) };
                    const currentOrder = productOrder[item.product.category] || (handlers.groupedProducts[item.product.category] || []).map((product: Product) => product.id);
                    const insertIndex = currentOrder.indexOf(item.product.id);
                    const nextOrder = currentOrder.filter((id: string) => id !== newId);
                    nextOrder.splice(insertIndex === -1 ? nextOrder.length : insertIndex + 1, 0, newId);
                    return { ...prev, customProductOrder: { ...productOrder, [item.product.category]: nextOrder }, name: 'Custom' };
                });
                return;
            }

            if (item.type === 'freeText') {
                insertFreeTextProduct(item.product, freeTextPlacement, index);
                return;
            }

            if (item.type === 'category') {
                const newCategory = getUniqueCategoryName(item.category);
                const categoryId = crypto.randomUUID();
                const productIds = item.products.map(() => crypto.randomUUID());

                onStyleUpdate?.((prev) => {
                    const currentOrder = getCategoryOrder();
                    const nextOrder = insertCategoryAfter(currentOrder, item.category, newCategory);
                    return {
                        ...prev,
                        customCategoryOrder: nextOrder,
                        customProductOrder: {
                            ...(prev.customProductOrder || {}),
                            [newCategory]: productIds,
                        },
                        name: 'Custom',
                    };
                });

                item.products.forEach((product, index) => {
                    onAddProduct?.(newCategory, undefined, false, productIds[index], getProductInitialData(product, categoryId));
                });
            }
        });

        return true;
    }, [getCategoryOrder, getUniqueCategoryName, handlers.groupedProducts, insertFreeTextProduct, onAddProduct, onStyleUpdate]);

    const deleteObjectItems = useCallback((items: ObjectSelectionItem[]) => {
        if (items.length === 0) return false;

        const productIdsToHide = new Set<string>();
        const categoriesToHide = new Set<string>();
        const productIdsToDelete = new Set<string>();
        const categoriesToDelete = new Set<string>();
        const freeTextIdsToDelete = new Set<string>();
        const addedImageIdsToDelete = new Set<string>();

        items.forEach((item) => {
            if (item.type === 'category') {
                if (isPristineNewCategory(item.id, products)) categoriesToDelete.add(item.id);
                else categoriesToHide.add(item.id);
                return;
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find((candidate) => candidate.id === item.id);
                if (product?.isFreeText || item.type === 'freeText') freeTextIdsToDelete.add(item.id);
                else if (isPristineNewProduct(product)) productIdsToDelete.add(item.id);
                else productIdsToHide.add(item.id);
                return;
            }

            addedImageIdsToDelete.add(item.id);
        });

        categoriesToDelete.forEach(category => {
            (handlers.groupedProducts[category] || products.filter(product => product.category === category)).forEach((product: Product) => {
                productIdsToDelete.add(product.id);
            });
        });

        onStyleUpdate?.((prev) => {
            const currentHidden = new Set(prev.hiddenProductIds || []);
            productIdsToHide.forEach((productId) => currentHidden.add(productId));
            categoriesToHide.forEach((category) => {
                (handlers.groupedProducts[category] || []).forEach((product: Product) => currentHidden.add(product.id));
            });
            productIdsToDelete.forEach(productId => currentHidden.delete(productId));

            const nextProductOrder = { ...(prev.customProductOrder || {}) };
            Object.keys(nextProductOrder).forEach(category => {
                if (categoriesToDelete.has(category)) {
                    delete nextProductOrder[category];
                    return;
                }
                nextProductOrder[category] = nextProductOrder[category].filter(productId => !productIdsToDelete.has(productId));
            });

            return {
                ...prev,
                hiddenProductIds: Array.from(currentHidden),
                customCategoryOrder: (prev.customCategoryOrder || []).filter(category => !categoriesToDelete.has(category)),
                customProductOrder: nextProductOrder,
                addedImages: addedImageIdsToDelete.size > 0
                    ? (prev.addedImages || []).filter((image) => !addedImageIdsToDelete.has(image.id))
                    : prev.addedImages,
                name: 'Custom',
            };
        });

        productIdsToDelete.forEach((productId) => onDeleteProduct?.(productId));
        freeTextIdsToDelete.forEach((productId) => onDeleteProduct?.(productId));
        handlers.handleSelection(null, null);
        return true;
    }, [handlers, onDeleteProduct, onStyleUpdate, products]);

    const pasteClipboard = useCallback(async (targetItem?: ObjectSelectionItem | null) => {
        const clipboard = clipboardRef.current;
        const menuPoint = objectMenu ? { x: objectMenu.x, y: objectMenu.y } : null;

        if (clipboard?.mode === 'items') {
            const hasFreeText = clipboard.items.some((item) => item.type === 'freeText');
            const placement = hasFreeText ? getFreeTextPastePlacement(menuPoint, targetItem) : null;
            return duplicateClipboardItems(clipboard.items, placement);
        }

        const nativePayload = await readNativeClipboardPayload();
        return nativePayload ? handleNativeClipboardPayload(nativePayload, menuPoint, targetItem) : false;
    }, [duplicateClipboardItems, getFreeTextPastePlacement, handleNativeClipboardPayload, objectMenu, readNativeClipboardPayload]);

    const pasteFormattingClipboard = useCallback((targetItem?: ObjectSelectionItem | null) => {
        const clipboard = clipboardRef.current;
        if (!clipboard || clipboard.mode !== 'format') return false;

        const targets = getActiveObjectItems(targetItem);
        if (targets.length === 0) return false;
        const { format } = clipboard;

        if (format.type === 'category') {
            if (!targets.some((item) => item.type === 'category')) return false;
            onStyleUpdate?.((prev) => ({
                ...prev,
                elementStyles: { ...prev.elementStyles, category: { ...format.style } },
                name: 'Custom',
            }));
            return true;
        }

        if (format.type === 'product') {
            if (!targets.some((item) => item.type === 'product')) return false;
            onStyleUpdate?.((prev) => ({
                ...prev,
                elementStyles: {
                    ...prev.elementStyles,
                    productName: { ...(format.styles.productName || {}) },
                    productPrice: { ...(format.styles.productPrice || {}) },
                    productDescription: { ...(format.styles.productDescription || {}) },
                },
                name: 'Custom',
            }));
            return true;
        }

        if (format.type === 'freeText') {
            const freeTextTargets = targets.filter((item) => item.type === 'freeText');
            freeTextTargets.forEach((item) => props.onUpdateProduct?.(item.id, 'styles', { ...format.style }));
            return freeTextTargets.length > 0;
        }

        const imageIds = new Set(targets.filter((item) => item.type === 'addedImage').map((item) => item.id));
        if (imageIds.size === 0) return false;
        onStyleUpdate?.((prev) => ({
            ...prev,
            addedImages: (prev.addedImages || []).map((image) => imageIds.has(image.id) ? { ...image, width: format.width } : image),
            name: 'Custom',
        }));
        return true;
    }, [getActiveObjectItems, onStyleUpdate, props]);

    const layerObjectItems = useCallback((items: ObjectSelectionItem[], direction: 'front' | 'back') => {
        if (items.length === 0) return false;

        const imageIds = new Set(items.filter((item) => item.type === 'addedImage').map((item) => item.id));
        const hasContentItems = items.some((item) => item.type !== 'addedImage');

        onStyleUpdate?.((prev) => {
            const images = prev.addedImages || [];
            const nextImageLayers = getImageLayerIndexes(images, Array.from(imageIds), direction);

            return {
                ...prev,
                contentLayer: hasContentItems ? (direction === 'front' ? 'front' : 'back') : prev.contentLayer,
                addedImages: imageIds.size > 0
                    ? images.map((image) => {
                        if (nextImageLayers.has(image.id)) {
                            return { ...image, zIndex: nextImageLayers.get(image.id) ?? image.zIndex };
                        }
                        return image;
                    })
                    : prev.addedImages,
                name: 'Custom',
            };
        });

        return true;
    }, [onStyleUpdate]);

    const hideObjectItems = useCallback((items: ObjectSelectionItem[]) => {
        const productIdsToHide = new Set<string>();
        const categoriesToHide = new Set<string>();

        items.forEach((item) => {
            if (item.type === 'category') {
                if (!isPristineNewCategory(item.id, products)) categoriesToHide.add(item.id);
                return;
            }

            if (item.type === 'product') {
                const product = products.find((candidate) => candidate.id === item.id);
                if (product && !product.isFreeText && !isPristineNewProduct(product)) productIdsToHide.add(item.id);
            }
        });

        if (productIdsToHide.size === 0 && categoriesToHide.size === 0) return false;

        onStyleUpdate?.((prev) => {
            const currentHidden = new Set(prev.hiddenProductIds || []);
            productIdsToHide.forEach((productId) => currentHidden.add(productId));
            categoriesToHide.forEach((category) => {
                (handlers.groupedProducts[category] || []).forEach((product: Product) => currentHidden.add(product.id));
            });

            return {
                ...prev,
                hiddenProductIds: Array.from(currentHidden),
                name: 'Custom',
            };
        });

        handlers.handleSelection(null, null);
        return true;
    }, [handlers, onStyleUpdate, products]);

    const runObjectAction = useCallback(async (action: 'copy' | 'copyFormat' | 'paste' | 'pasteFormat' | 'cut' | 'duplicate' | 'delete' | 'hide' | 'front' | 'back', targetItem?: ObjectSelectionItem | null) => {
        const items = getActiveObjectItems(targetItem);
        let handled = false;

        if (action === 'copy') handled = copyItems(items);
        if (action === 'copyFormat') handled = copyFormatting(items);
        if (action === 'paste') handled = await pasteClipboard(targetItem);
        if (action === 'pasteFormat') handled = pasteFormattingClipboard(targetItem);
        if (action === 'cut') {
            handled = copyItems(items);
            if (handled) deleteObjectItems(items);
        }
        if (action === 'duplicate') {
            const clipboardItems = buildClipboardItems(items);
            handled = duplicateClipboardItems(clipboardItems);
        }
        if (action === 'delete') handled = deleteObjectItems(items);
        if (action === 'hide') handled = hideObjectItems(items);
        if (action === 'front') handled = layerObjectItems(items, 'front');
        if (action === 'back') handled = layerObjectItems(items, 'back');

        if (handled) setObjectMenu(null);
        return handled;
    }, [buildClipboardItems, copyFormatting, copyItems, deleteObjectItems, duplicateClipboardItems, getActiveObjectItems, hideObjectItems, layerObjectItems, pasteClipboard, pasteFormattingClipboard]);

    useEffect(() => {
        if (props.externalAction?.type !== 'APPEND_FREE_TEXT') return;
        if (handledExternalActionIdRef.current === props.externalAction.id) return;
        handledExternalActionIdRef.current = props.externalAction.id;

        window.setTimeout(() => {
            insertFreeTextProduct({
                id: '',
                name: 'Novo texto',
                description: '',
                price: 0,
                category: '',
                isFreeText: true,
            }, getFreeTextPlacementBelowSelection() || getLastFreeTextPlacement());
        }, 0);
    }, [getLastFreeTextPlacement, getFreeTextPlacementBelowSelection, insertFreeTextProduct, props.externalAction]);

    const openObjectMenu = useCallback((event: React.MouseEvent, item: CanvasContextMenuItem) => {
        event.preventDefault();
        event.stopPropagation();
        if (handlers.draggedItem || handlers.draggedImageId) {
            setObjectMenu(null);
            return;
        }

        const objectItems = (handlers.selectedItems || []).filter(isObjectItem);
        const isTargetSelected = objectItems.some((selected) => selected.type === item.type && selected.id === item.id);
        if (!isTargetSelected) {
            handlers.handleSelection(item.type, item.id);
        }

        setObjectMenuPosition(null);
        setObjectMenu({ x: event.clientX, y: event.clientY, item });
    }, [handlers]);

    (handlers as any).openObjectMenu = openObjectMenu;

    useEffect(() => {
        if (handlers.draggedItem || handlers.draggedImageId) setObjectMenu(null);
    }, [handlers.draggedImageId, handlers.draggedItem]);

    const openBackgroundMenu = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest([
            '[data-drag-type]',
            '[data-added-image-drag="true"]',
            '[data-menu-heading]',
            'button',
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
        ].join(','))) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        handlers.handleSelection(null, null);
        handlers.setEditingId(null);
        handlers.setSelectedPageIndex(null);
        setObjectMenuPosition(null);
        setObjectMenu({ x: event.clientX, y: event.clientY, item: null });
    }, [handlers]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Delete') return;

            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (document.body.dataset.automenuDeleteContext === 'product-designer') return;

            if (handleDeleteSelectedCanvasItems()) {
                event.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDeleteSelectedCanvasItems]);

    useEffect(() => {
        const handleClipboardShortcuts = (event: KeyboardEvent) => {
            const isDesktop = window.matchMedia('(min-width: 768px)').matches;
            if (!isDesktop) return;
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

            const key = event.key.toLowerCase();
            if (!['c', 'v', 'x'].includes(key)) return;

            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (document.body.dataset.automenuDeleteContext !== 'canvas') return;

            const selectedObjects = (handlers.selectedItems || []).filter(isObjectItem);
            if (key !== 'v' && selectedObjects.length === 0) return;
            if (key === 'v' && clipboardRef.current?.mode !== 'items') return;

            event.preventDefault();
            event.stopPropagation();

            if (key === 'c') runObjectAction('copy');
            if (key === 'v') runObjectAction('paste');
            if (key === 'x') runObjectAction('cut');
        };

        window.addEventListener('keydown', handleClipboardShortcuts);
        return () => window.removeEventListener('keydown', handleClipboardShortcuts);
    }, [handlers.selectedItems, runObjectAction]);

    useEffect(() => {
        const handleNativePaste = (event: ClipboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (document.body.dataset.automenuDeleteContext !== 'canvas') return;

            const clipboardData = event.clipboardData;
            if (!clipboardData) return;

            const imageItem = Array.from(clipboardData.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
            const imageFile = imageItem?.getAsFile();
            const text = clipboardData.getData('text/plain');
            const payload: NativeClipboardPayload | null = imageFile
                ? { type: 'image', blob: imageFile }
                : text.trim()
                    ? { type: 'text', text }
                    : null;

            if (!payload) return;
            event.preventDefault();
            void handleNativeClipboardPayload(payload, payload.type === 'image' ? getImagePastePoint(null) : null);
        };

        window.addEventListener('paste', handleNativePaste);
        return () => window.removeEventListener('paste', handleNativePaste);
    }, [getImagePastePoint, handleNativeClipboardPayload]);

    const restoreProduct = (id: string) => { onToggleProductVisibility?.(id, true); handlers.setShowAddModal(null); };
    const createNewInModal = () => { if (handlers.showAddModal) { onAddProduct?.(handlers.showAddModal.category); handlers.setShowAddModal(null); } };

    // FIX: GLOBAL DESELECTION
    const handleBackgroundClick = (e: React.MouseEvent) => {
        setObjectMenu(null);
        // Se o alvo do clique não for uma página, um produto ou um controle, limpe.
        const target = e.target as HTMLElement;
        if (target.closest('[data-page-index]') || target.closest('button') || target.closest('[contenteditable="true"]')) {
            return;
        }

        handlers.handleSelection(null, null);
        handlers.setEditingId(null);
        handlers.setSelectedPageIndex(null);
    };

    const pendingDeletePageIndexes = getPageIndexesForDeletion();
    const isDeletingSelectedPages = pendingDeletePageIndexes.length > 1;
    const hasClipboardItems = (clipboardVersion >= 0 && clipboardRef.current?.mode === 'items') || nativeClipboardAvailable;
    const hasClipboardFormat = clipboardVersion >= 0 && clipboardRef.current?.mode === 'format';
    const isBackgroundMenu = Boolean(objectMenu && !objectMenu.item);
    const isMenuTitleContext = objectMenu?.item?.type === 'menuTitle';
    const contextObjectItem = objectMenu?.item && isObjectItem(objectMenu.item)
        ? objectMenu.item
        : null;
    const objectMenuItems = contextObjectItem ? getActiveObjectItems(contextObjectItem) : [];
    const canHideFromObjectMenu = objectMenuItems.some((item) => {
        if (item.type === 'category') return !isPristineNewCategory(item.id, products);
        if (item.type === 'product') {
            const product = products.find(candidate => candidate.id === item.id);
            return Boolean(product && !product.isFreeText && !isPristineNewProduct(product));
        }
        return false;
    });
    const menuLeft = objectMenuPosition?.left
        ?? (objectMenu ? clamp(objectMenu.x, 8, Math.max(8, window.innerWidth - 220)) : 0);
    const menuTop = objectMenuPosition?.top ?? 8;

    return (
        <div
            ref={previewRootRef}
            className="flex justify-start w-full relative min-h-full min-w-full md:cursor-grab"
            onClick={handleBackgroundClick}
            onContextMenu={openBackgroundMenu}
            onPointerDownCapture={handlePreviewPointerDownCapture}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerEnd}
            onPointerCancel={handlePreviewPointerEnd}
            onClickCapture={(event) => {
                if (!suppressMarqueeClickRef.current) return;
                suppressMarqueeClickRef.current = false;
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <DynamicFontLoader fonts={usedFonts} />

            {marqueeRect && createPortal(
                <div
                    data-marquee-selection="true"
                    className="fixed pointer-events-none border border-indigo-500 bg-indigo-500/15"
                    style={{ ...marqueeRect, zIndex: 2147483000 }}
                />,
                document.body
            )}

            {handlers.showAddModal && (createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => handlers.setShowAddModal(null)}> <div className="bg-white p-4 rounded-xl shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}> <h3 className="text-lg font-bold mb-4">Itens ocultos</h3> <div className="space-y-2 max-h-60 overflow-y-auto"> {products.filter(p => p.category === handlers.showAddModal!.category && !handlers.groupedProducts[handlers.showAddModal!.category]?.find(gp => gp.id === p.id)).map(p => (<button key={p.id} onClick={() => restoreProduct(p.id)} className="w-full p-2 text-left hover:bg-slate-100 rounded flex justify-between items-center"> <span>{p.name}</span> <Plus size={14} /> </button>))} </div> <div className="mt-4 pt-4 border-t"> <button onClick={createNewInModal} className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"> Criar novo item </button> </div> </div> </div>, document.body))}

            <div className="flex flex-row gap-8 px-8 pb-20 pt-16 items-start min-h-full w-fit mx-auto">
                {pages.map((pageContent, i) => (
                    <MenuPage
                        key={i}
                        pageIndex={i}
                        page={pageContent}
                        style={style}
                        handlers={handlers}
                        products={products}
                        needsOverlay={!!style.sourceImage}
                        pageCount={pages.length}
                        onAddPage={handleAddPage}
                        onDeletePage={(idx) => { handlers.setShowDeletePageConfirm(true); handlers.setPageToDelete(idx); }}
                    />
                ))}
            </div>

            {objectMenu && createPortal(
                <div
                    ref={objectMenuRef}
                    className="fixed z-[10000] min-w-52 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl text-sm text-slate-700"
                    style={{ left: menuLeft, top: menuTop }}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    {isMenuTitleContext ? (
                        <button
                            onClick={() => {
                                onStyleUpdate?.((previous) => ({
                                    ...previous,
                                    menuSubtitle: 'Novo subtítulo',
                                    name: 'Custom',
                                }));
                                handlers.handleSelection('menuSubtitle', 'menuSubtitle');
                                setObjectMenu(null);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                        >
                            <Plus size={15} /> Adicionar subtítulo
                        </button>
                    ) : (
                    <>
                    <button onClick={() => { handlers.setMultiSelectMode?.(!handlers.multiSelectMode); setObjectMenu(null); }} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"><ListChecks size={15} /> Seleção múltipla</button>
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('copy', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Copy size={15} /> Copiar</button>
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('copyFormat', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Paintbrush size={15} /> Copiar formatacao</button>
                    <button
                        onClick={() => runObjectAction('paste', contextObjectItem)}
                        disabled={!hasClipboardItems}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Clipboard size={15} /> Colar
                    </button>
                    <button
                        onClick={() => runObjectAction('pasteFormat', contextObjectItem)}
                        disabled={isBackgroundMenu || !hasClipboardFormat}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Paintbrush size={15} /> Colar formatacao
                    </button>
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('cut', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Scissors size={15} /> Recortar</button>
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('duplicate', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><CopyPlus size={15} /> Duplicar</button>
                    {(canHideFromObjectMenu || isBackgroundMenu) && (
                        <button disabled={isBackgroundMenu} onClick={() => runObjectAction('hide', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><EyeOff size={15} /> Ocultar</button>
                    )}
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('delete', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={15} /> Deletar</button>
                    <div className="my-1 h-px bg-slate-100" />
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('front', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><BringToFront size={15} /> Trazer para frente</button>
                    <button disabled={isBackgroundMenu} onClick={() => runObjectAction('back', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><SendToBack size={15} /> Trazer para tras</button>
                    </>
                    )}
                </div>,
                document.body
            )}

            {handlers.showDeletePageConfirm && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border border-slate-200 transform scale-100">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-3">
                            {isDeletingSelectedPages ? 'Excluir páginas selecionadas?' : 'Excluir esta página?'}
                        </h3>
                        <p className="text-slate-500 mb-8 leading-relaxed">
                            {isDeletingSelectedPages ? (
                                <>
                                    Você está prestes a remover <strong>{pendingDeletePageIndexes.length} páginas selecionadas</strong>. Todos os textos livres serão <span className="text-red-600 font-bold">excluídos permanentemente</span>. Produtos e categorias serão ocultados, mas permanecerão no banco de dados.
                                </>
                            ) : (
                                <>
                                    Você está prestes a remover a <strong>página {handlers.pageToDelete !== null ? handlers.pageToDelete + 1 : ''}</strong>. Todos os textos livres serão <span className="text-red-600 font-bold">excluídos permanentemente</span>. Produtos e categorias serão ocultados, mas permanecerão no banco de dados.
                                </>
                            )}
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => { handlers.setShowDeletePageConfirm(false); handlers.setPageToDelete(null); }} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleDeletePage} className="flex-1 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700 font-semibold shadow-lg shadow-red-200 transition-colors">
                                Sim, excluir
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
