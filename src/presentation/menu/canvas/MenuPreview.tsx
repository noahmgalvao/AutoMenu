import { getProductColumnCount } from '../../../domain/menu/categoryColumns';
import { lockModalScrolling } from '../../common/modalScroll';
import { setElementFormatting, type FormattingKind } from '../../../domain/menu/itemFormatting';
import { reindexMenuPages } from '../../../domain/menu/reindexMenuPages';
import { useMenuPageMeasurements } from './useMenuPageMeasurements';
import { captureCanvasObjectScale } from './canvasObjectScale';
import { getCanvasDragScale, type CanvasScaleTarget } from './CanvasTransformHandles';
import { headingElementId, headingIsOnPage, headingPageIndex, headingSelectionId, menuHeadingFields, remapHeadingPages, type MenuHeadingField } from '../../../domain/menu/menuHeadings';
import { duplicateMenuPage } from '../../../domain/menu/duplicateMenuPage';
import { isCanvasObjectOrControlTarget } from './canvasHitTargets';
import { CanvasImageCropDialog } from './CanvasImageCropDialog';
import type { CanvasImageCrop } from '../../../domain/menu/model';
import { categoryKey, categoryName } from '../../../domain/menu/categoryName';
import { copiedProductFields, lastCanvasCopy, matchingCanvasCopy, pasteCanvasObjects, writeCanvasCopy, type CanvasClip, type CopiedObject, type PasteContent } from './canvasClipboard';
import { hasPhotosForType, type PhotoType } from './photoSizing';
import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { CategoryPosition, ElementStyle, Product, MenuStyle, SortOption } from '../../../domain/menu/model';
import { Crop, AlertTriangle, BringToFront, Copy, CopyCheck, CopyPlus, Edit3, EyeOff, Wallpaper, FlipHorizontal2, FlipVertical2, Images, Layers, Paintbrush, Clipboard, Plus, Scissors, SendToBack, Trash2 } from 'lucide-react';
import { calculatePagination, finalizeMenuPages, getCategoryFitRegression, getMenuTypographyScale, getSavedCategoryPlacements, reflowPositionsForMenuHeadings } from '../../../domain/menu/menuPagination';
import { FREE_TEXT_PREFIX, SAFETY_BUFFER } from '../../../domain/menu/flow';
import { isPristineNewCategory, isPristineNewProduct } from '../../../domain/menu/pristineItems';
import { useMenuInteractions } from '../interactions/useMenuInteractions';
import { useReplacePlaceholderOnInput } from '../interactions/useReplacePlaceholderOnInput';
import { useResponsivePrices } from './useResponsivePrices';
import { NUDGE_STEP, type DraftItem, type MoveDirection, type SelectionItem } from '../interactions/types';
import { MenuPage, type AddedImagePreview } from './MenuPage';
import { canMoveImageLayer, getContentLayer, getFreeTextLayer, getImageLayerIndexes, hasForegroundImage, moveImageToMenuBackground } from '../../../domain/menu/imageLayers';
import { getCanvasViewportFocus, observeAnchorScroll } from './canvasViewport';
import { getSelectedLayerIds, rotateCanvasShape, setCanvasImageBackground } from '../../../domain/menu/canvasShapes';
import { acceptsCanvasFormat, applyCanvasFormat, captureCanvasFormat, type CanvasFormat, type FormatObject } from './canvasFormatting';
import { isHeadingTextHit } from './menuHeadingHit';
import type { FlowDirection } from './flowControls';
import { getCollisionSafeFreeTextTop } from '../interactions/freeTextMovement';
import { resolveMenuMargins } from '../../../domain/menu/styleRules';
import { canIncreaseCanvasFontSize, triggerLimitFeedback } from './textFit';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { roundPrice } from '../../../domain/menu/price';
import { PricePropagationPrompt } from '../PricePropagationPrompt';
import {
    applyPriceOperations,
    createPricePropagationRequest,
    getPricePropagationSourceIds,
    mergePricePropagationRequest,
    type PriceAdjustmentMode,
    type PricePropagationRequest,
} from '../../../domain/menu/pricePropagation';
import { FontPropagationPrompt, type FontPropagationRequest } from '../FontPropagationPrompt';
import { applyFontToMenuStyle, getConfiguredCanvasFonts } from '../../../domain/menu/fontPropagation';


interface MenuPreviewProps {
    addedImagePreview?: AddedImagePreview;
    onChooseBackgroundImage?: () => void;
    onMovePhotoToBackground?: (id: string) => void;
    onRemoveBackgroundPhoto?: () => void;
    isAddingImage?: boolean;
    products: Product[];
    style: MenuStyle;
    sortOption: SortOption;
    onPasteObjects?: (products: Product[], style: MenuStyle, actionLabel?: string) => void;
    onMoveCategory?: (category: string, direction: MoveDirection) => void;
    onMoveProduct?: (productId: string, category: string, direction: MoveDirection) => void;
    onUpdateProduct?: (id: string, field: keyof Product, value: any, priceEnteredWithDecimals?: boolean) => void;
    onUpdateProducts?: (updates: { id: string, field: keyof Product, value: any }[]) => void;
    onUpdateCategoryName?: (oldName: string, newName: string) => void;
    onUpdateMenuText?: (field: 'menuTitle' | 'menuSubtitle', value: string) => void;
    onCommitCategoryOrder?: (newOrder: string[], movedCategories?: string[]) => void;
    onCommitProductOrder?: (category: string, newOrder: string[], manuallyChanged: boolean) => void;
    onToggleProductVisibility?: (productId: string, visible: boolean) => void;
    onAddProduct?: (category: string, productId?: string, isFreeText?: boolean, specificId?: string, initialData?: Partial<Product>, options?: { index?: number }) => void;
    onAddCategory?: (nearCategory: string, position: 'before' | 'after') => void;
    onDeleteProduct?: (productId: string) => void;
    onStyleUpdate?: React.Dispatch<React.SetStateAction<MenuStyle>>;
    onItemFormattingUpdate?: (kind: FormattingKind, id: string, recipe: (style: MenuStyle) => MenuStyle) => void;
    externalAction?: { type: string, id: number };
    onSelectionChange?: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }, extendSelection?: boolean) => void;
    onSelectedItemsChange?: (items: SelectionItem[]) => void;
    selection?: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    scale?: number;
    splitCategoryAcrossPages?: boolean;
    productsCanChangeCategory?: boolean;
    readOnly?: boolean;
    stackPages?: boolean;
    visiblePageIndex?: number;
    onPageCountChange?: (pageCount: number) => void;
    onProductEditStart?: (productId: string) => void;
    onProductEditEnd?: (nextObject?: HTMLElement | null) => void;
    onChangeShape?: (id: string) => void;
    onUploadProductImage?: (productId: string, file: File, type?: PhotoType) => Promise<{ url: string; assetId: string }>;
}

type ObjectSelectionItem = SelectionItem & { type: 'product' | 'category' | 'freeText' | 'addedImage' };
type CanvasContextMenuItem = FormatObject;

const isHeadingSelectionOnPage = (item: SelectionItem, pageIndex: number) =>
    (item.type === 'menuTitle' || item.type === 'menuSubtitle') && headingPageIndex(item.id) === pageIndex;

type NativeClipboardPayload =
    | { type: 'objects'; clip: CanvasClip }
    | { type: 'text'; text: string }
    | { type: 'image'; blob: Blob }
    | { type: 'imageUrl'; url: string };

function clipboardImageUrl(html: string) {
    if (!html) return null;
    const source = new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src');
    return source && /^(?:https?:\/\/|data:image\/)/i.test(source) ? source : null;
}

type ObjectMenuState = {
    x: number;
    y: number;
    item: CanvasContextMenuItem | null;
    pasteAt?: CategoryPosition;
    anchored?: boolean;
    pageIndex?: number;
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
export const DynamicFontLoader: React.FC<{ fonts: string[] }> = ({ fonts }) => {
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
    const [pendingPricePropagation, setPendingPricePropagation] = useState<PricePropagationRequest | null>(null);
    const [pendingFontPropagation, setPendingFontPropagation] = useState<FontPropagationRequest | null>(null);
    const [backgroundPromptId, setBackgroundPromptId] = useState<string | null>(null);
    const [backgroundPromptPosition, setBackgroundPromptPosition] = useState<{ left: number; top: number }>();
    const backgroundPromptRef = useRef<HTMLDivElement | null>(null);
    const promptedLayerIds = useRef(new Set<string>());
    const formatClipboardRef = useRef<{
        format: CanvasFormat; source: FormatObject; armed: boolean; headings?: Partial<Record<MenuHeadingField, CanvasFormat>>;
    } | null>(null);
    const skipBackgroundDismissClickRef = useRef(false);
    const productImageInputRef = useRef<HTMLInputElement | null>(null);
    const photoUploads = useRef(new Map<string, symbol>());
    const [loadingPhotos, setLoadingPhotos] = useState<ReadonlySet<string>>(() => new Set());
    const refreshLoadingPhotos = () => setLoadingPhotos(new Set(photoUploads.current.keys()));
    const pendingPhoto = useRef<{ type: PhotoType; id: string } | null>(null);
    const handleProductUpdateWithPricePrompt = useCallback((id: string, field: keyof Product, value: any, priceEnteredWithDecimals?: boolean) => {
        if (field !== 'price') {
            props.onUpdateProduct?.(id, field, value);
            return;
        }

        const product = props.products.find((candidate) => candidate.id === id);
        const nextPrice = roundPrice(value);
        props.onUpdateProduct?.(id, field, nextPrice, priceEnteredWithDecimals);
        if (!product || product.isFreeText || roundPrice(product.price) === 0 || product.price === nextPrice) return;

        const request = createPricePropagationRequest({
            productId: id,
            productName: product.name,
            previousPrice: product.price,
            nextPrice,
        });
        setPendingPricePropagation((current) => mergePricePropagationRequest(current, request));
    }, [props.onUpdateProduct, props.products]);
    const finishImageEdit = useCallback((id: string) => {
        const image = props.style.addedImages?.find((candidate) => candidate.id === id);
        if (!props.readOnly && image && !image.repeatAsBackground && !image.backgroundPromptDismissed
            && !promptedLayerIds.current.has(id) && !formatClipboardRef.current?.armed) {
            promptedLayerIds.current.add(id);
            setBackgroundPromptId(id);
        }
    }, [props.readOnly, props.style.addedImages]);
    const handlers = useMenuInteractions({ ...props, onUpdateProduct: handleProductUpdateWithPricePrompt, onImageEditEnd: finishImageEdit });
    const previewRootRef = useRef<HTMLDivElement | null>(null);
    const blankPageClicks = useRef({ page: null as HTMLElement | null, consecutive: 0 });
    useReplacePlaceholderOnInput(previewRootRef);
    useResponsivePrices(previewRootRef, props.style);
    const [scalePreview, setScalePreview] = useState<ReturnType<ReturnType<typeof captureCanvasObjectScale>>>();
    const [rotationPreview, setRotationPreview] = useState<{ type: 'addedImage' | 'freeText'; id: string; rotation: number }>();
    const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
    const [imageCropId, setImageCropId] = useState<string | null>(null);
    const openImageCrop = (id: string) => {
        setObjectMenu(null);
        setImageCropId(id);
    };
    (handlers as typeof handlers & { openImageCrop: (id: string) => void }).openImageCrop = openImageCrop;
    const croppingImage = props.style.addedImages?.find(image => image.id === imageCropId && !image.shape);
    const applyImageCrop = (crop: CanvasImageCrop) => {
        if (!croppingImage) return;
        const { id, url } = croppingImage;
        props.onStyleUpdate?.(previous => ({
            ...previous, name: 'Custom',
            addedImages: previous.addedImages?.map(image => {
                if (image.id !== id || image.url !== url || image.shape) return image;
                const originalWidth = image.width / (image.crop?.width || 1);
                const left = (crop.x - (image.crop?.x || 0)) * originalWidth;
                const top = (crop.y - (image.crop?.y || 0)) * originalWidth / crop.aspect;
                const { widthPx, heightPx } = resolveMenuPageDimensions(previous);
                const width = Math.min(originalWidth * crop.width, widthPx, heightPx * crop.aspect * crop.width / crop.height);
                const height = width * crop.height / (crop.aspect * crop.width);
                return { ...image, crop, width,
                    x: Math.max(0, Math.min(widthPx - width, image.x + (image.flipHorizontal ? image.width - width - left : left))),
                    y: Math.max(0, Math.min(heightPx - height, image.y + (image.flipVertical ? image.width * (image.crop?.height || 1) / ((image.crop?.width || 1) * crop.aspect) - height - top : top))),
                };
            }),
        }));
        setImageCropId(null);
    };
    const objectMenuRef = useRef<HTMLDivElement | null>(null);
    const lastPastePosition = useRef<CategoryPosition | null>(null);
    const lastCanvasPointRef = useRef<{ x: number; y: number } | null>(null);
    const handledExternalActionIdRef = useRef<number | null>(null);
    const marqueeDragRef = useRef<MarqueeDragState | null>(null);
    const suppressMarqueeClickRef = useRef(false);
    const suppressBackgroundPressClickRef = useRef(false);
    const backgroundPressRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        timeoutId: number;
    } | null>(null);
    const lastPreviewPointerTypeRef = useRef<string | null>(null);
    const suppressTouchObjectMenuUntilRef = useRef(0);
    const touchStartedOnObjectMenuButtonRef = useRef(false);
    const [, setClipboardVersion] = useState(0);
    const [objectMenu, setObjectMenu] = useState<ObjectMenuState | null>(null);
    (handlers as any).objectMenuOpen = Boolean(objectMenu);
    const [objectMenuPosition, setObjectMenuPosition] = useState<{ left: number; top: number; maxHeight?: number } | null>(null);
    const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

    useEffect(() => {
        const openTouchMenu = (event: Event) => {
            const detail = (event as CustomEvent<{ type: ObjectSelectionItem['type']; id: string; x: number; y: number }>).detail;
            if (!detail || !['product', 'category', 'freeText', 'addedImage'].includes(detail.type)) return;
            setObjectMenuPosition(null);
            const page = previewRootRef.current && document.elementFromPoint(detail.x, detail.y)?.closest<HTMLElement>('[data-page-index]');
            setObjectMenu({ x: detail.x, y: detail.y, item: { type: detail.type, id: detail.id }, anchored: true, pageIndex: page ? Number(page.dataset.pageIndex) : undefined });
        };
        const closeTouchMenu = () => setObjectMenu(null);
        window.addEventListener('automenu:canvas-drag-ready', openTouchMenu);
        window.addEventListener('automenu:canvas-drag-move', closeTouchMenu);
        return () => {
            window.removeEventListener('automenu:canvas-drag-ready', openTouchMenu);
            window.removeEventListener('automenu:canvas-drag-move', closeTouchMenu);
        };
    }, []);
    const {
        products, style, onAddProduct, onStyleUpdate, onDeleteProduct, onToggleProductVisibility, onSelectedItemsChange,
        readOnly = false, visiblePageIndex, onPageCountChange,
    } = props;
    const pageDimensions = resolveMenuPageDimensions(style);
    const promptedImage = style.addedImages?.find((image) => image.id === backgroundPromptId && !image.repeatAsBackground && !image.backgroundPromptDismissed);
    const promptOpen = Boolean(promptedImage);
    const dismissBackgroundPrompt = useCallback(() => {
        if (!backgroundPromptId) return;
        const ids = getSelectedLayerIds(handlers.selectedItems, backgroundPromptId);
        onStyleUpdate?.(previous => ({
            ...previous,
            addedImages: previous.addedImages?.map(image => ids.has(image.id) && !image.backgroundPromptDismissed
                ? { ...image, backgroundPromptDismissed: true } : image),
        }));
        setBackgroundPromptId(null);
    }, [backgroundPromptId, handlers.selectedItems, onStyleUpdate]);

    useEffect(() => {
        if (readOnly) return;
        const finishSidebarImageEdit = (event: Event) => finishImageEdit((event as CustomEvent<string>).detail);
        window.addEventListener('automenu:image-edit-end', finishSidebarImageEdit);
        return () => window.removeEventListener('automenu:image-edit-end', finishSidebarImageEdit);
    }, [finishImageEdit, readOnly]);

    React.useLayoutEffect(() => {
        if (!promptedImage) return;
        const anchor = document.getElementById(`added-image-${promptedImage.pageIndex || 0}-${promptedImage.id}`);
        const prompt = backgroundPromptRef.current;
        if (!anchor || !prompt) return;
        const position = () => {
            const rect = anchor.getBoundingClientRect();
            const width = prompt.offsetWidth;
            setBackgroundPromptPosition({
                left: clamp((rect.left + rect.right - width) / 2, 8, Math.max(8, window.innerWidth - width - 8)),
                top: rect.bottom + 6,
            });
        };
        position();
        const observer = new ResizeObserver(position);
        observer.observe(anchor);
        const stopObservingScroll = observeAnchorScroll(anchor, position);
        window.addEventListener('resize', position);
        return () => {
            observer.disconnect();
            stopObservingScroll();
            window.removeEventListener('resize', position);
        };
    }, [promptedImage, props.scale]);

    useEffect(() => {
        if (readOnly) return;
        const dismissOutside = (event: PointerEvent) => {
            skipBackgroundDismissClickRef.current = false;
            if (!promptOpen || backgroundPromptRef.current?.contains(event.target as Node)) return;
            skipBackgroundDismissClickRef.current = true;
            event.preventDefault();
            event.stopPropagation();
            dismissBackgroundPrompt();
        };
        const skipDismissClick = (event: MouseEvent) => {
            if (!skipBackgroundDismissClickRef.current) return;
            skipBackgroundDismissClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
        };
        window.addEventListener('pointerdown', dismissOutside, true);
        window.addEventListener('click', skipDismissClick, true);
        window.addEventListener('contextmenu', skipDismissClick, true);
        return () => {
            window.removeEventListener('pointerdown', dismissOutside, true);
            window.removeEventListener('click', skipDismissClick, true);
            window.removeEventListener('contextmenu', skipDismissClick, true);
        };
    }, [dismissBackgroundPrompt, promptOpen, readOnly]);

    const setImageBackground = (id: string, pageIndex?: number) => {
        const source = style.addedImages?.find(image => image.id === id);
        if (!source) return;
        const ids = getSelectedLayerIds(handlers.selectedItems, id);
        onStyleUpdate?.((previous) => ({
            ...previous,
            addedImages: previous.addedImages?.map(image => ids.has(image.id)
                ? setCanvasImageBackground(image, !source.repeatAsBackground, image.id === id ? pageIndex : undefined) : image),
            name: 'Custom',
        }));
        setBackgroundPromptId(null);
        setObjectMenu(null);
    };

    const toggleFreeTextBackground = (id: string) => {
        const text = document.getElementById(`product-container-${id}`);
        const page = text?.closest<HTMLElement>('[data-menu-print-page][data-page-index]');
        if (!text || !page) return;
        const rect = text.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const scale = pageRect.width / page.offsetWidth || 1;
        const position = {
            x: (rect.left - pageRect.left) / scale,
            y: (rect.top - pageRect.top) / scale,
            width: text.offsetWidth,
            pageIndex: Number(page.dataset.pageIndex),
        };
        onStyleUpdate?.((previous) => {
            const backgrounds = { ...previous.freeTextBackgrounds };
            if (backgrounds[id]) delete backgrounds[id];
            else backgrounds[id] = position;
            return { ...previous, freeTextBackgrounds: backgrounds, name: 'Custom' };
        });
        handlers.setEditingId(null);
        handlers.setFormattingTarget(null);
        setObjectMenu(null);
    };

    const flipImage = (id: string, axis: 'flipHorizontal' | 'flipVertical') => {
        const source = style.addedImages?.find(image => image.id === id);
        if (!source) return;
        const ids = getSelectedLayerIds(handlers.selectedItems, id);
        onStyleUpdate?.((previous) => ({
            ...previous,
            addedImages: previous.addedImages?.map(image => ids.has(image.id) ? { ...image, [axis]: !source[axis] } : image),
            name: 'Custom',
        }));
        setObjectMenu(null);
        finishImageEdit(id);
    };

    (handlers as any).finishImageEdit = finishImageEdit;

    const adjustProductPrice = useCallback((
        productId: string,
        direction: 1 | -1,
        amount: number,
        mode: PriceAdjustmentMode,
    ) => {
        const product = products.find((candidate) => candidate.id === productId);
        if (!product || product.isFreeText || !Number.isFinite(amount) || amount <= 0) return;
        const signedAmount = direction * amount;
        const nextPrice = roundPrice(
            mode === 'percentage'
                ? product.price * (1 + (signedAmount / 100))
                : product.price + signedAmount,
        );
        if (nextPrice === product.price) return;
        props.onUpdateProduct?.(productId, 'price', nextPrice);
        if (roundPrice(product.price) === 0) return;
        const request = createPricePropagationRequest({
            productId,
            productName: product.name,
            previousPrice: product.price,
            nextPrice,
            operation: { mode, signedAmount },
        });
        setPendingPricePropagation((current) => mergePricePropagationRequest(current, request));
    }, [products, props.onUpdateProduct]);

    const applyPricePropagation = useCallback(() => {
        if (!pendingPricePropagation) return;
        const sourceIds = getPricePropagationSourceIds(pendingPricePropagation);
        const updates = products
            .filter((product) => !product.isFreeText && !sourceIds.has(product.id))
            .map((product) => ({
                id: product.id,
                field: 'price' as keyof Product,
                value: applyPriceOperations(product.price, pendingPricePropagation.operations),
            }));

        if (updates.length > 0) {
            if (props.onUpdateProducts) props.onUpdateProducts(updates);
            else updates.forEach((update) => props.onUpdateProduct?.(update.id, update.field, update.value));
        }
        setPendingPricePropagation(null);
    }, [pendingPricePropagation, products, props.onUpdateProduct, props.onUpdateProducts]);

    (handlers as any).adjustProductPrice = adjustProductPrice;
    const choosePhoto = (type: PhotoType, id: string) => {
        pendingPhoto.current = { type, id };
        productImageInputRef.current?.click();
    };
    const setPhoto = (type: PhotoType, id: string, url: string, assetId: string | null) => {
        if (type === 'category') {
            onStyleUpdate?.(prev => ({
                ...prev, name: 'Custom', showCategoryImages: url ? true : prev.showCategoryImages,
                categoryImages: {
                    ...prev.categoryImages, [id]: { ...prev.categoryImages?.[id], url, assetId, crop: undefined },
                },
            }));
            return;
        }
        const updates = [{ id, field: 'image' as const, value: url }, { id, field: 'imageAssetId' as const, value: assetId }];
        if (props.onUpdateProducts) props.onUpdateProducts(updates);
        else updates.forEach(update => props.onUpdateProduct?.(id, update.field, update.value));
        onStyleUpdate?.(prev => {
            if (url) return { ...prev, showImages: true, productPhotoCrops: { ...prev.productPhotoCrops, [id]: { x: 50, y: 50 } } };
            if (!prev.productPhotoCrops?.[id]) return prev;
            const productPhotoCrops = { ...prev.productPhotoCrops };
            delete productPhotoCrops[id];
            return { ...prev, productPhotoCrops };
        });
    };
    (handlers as any).photoIsLoading = (type: PhotoType, id: string) => loadingPhotos.has(`${type}:${id}`);
    (handlers as any).changeShape = props.onChangeShape;
    (handlers as any).choosePhoto = choosePhoto;
    (handlers as any).removePhoto = (type: PhotoType, id: string) => {
        photoUploads.current.delete(`${type}:${id}`);
        refreshLoadingPhotos();
        setPhoto(type, id, '', null);
    };
    const handleProductImageInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const target = pendingPhoto.current;
        const file = event.target.files?.[0];
        event.target.value = '';
        pendingPhoto.current = null;
        if (!target || !file) return;
        const key = `${target.type}:${target.id}`;
        const upload = Symbol();
        photoUploads.current.set(key, upload);
        refreshLoadingPhotos();
        try {
            const uploaded = await props.onUploadProductImage?.(target.id, file, target.type);
            const url = uploaded?.url ?? await blobToDataUrl(file);
            if (photoUploads.current.get(key) === upload) setPhoto(target.type, target.id, url, uploaded?.assetId ?? null);
        } catch {
            if (photoUploads.current.get(key) === upload) window.alert('Não foi possível alterar a imagem. Tente novamente.');
        } finally {
            if (photoUploads.current.get(key) === upload) {
                photoUploads.current.delete(key);
                refreshLoadingPhotos();
            }
        }
    };

    useEffect(() => () => {
        if (backgroundPressRef.current) {
            window.clearTimeout(backgroundPressRef.current.timeoutId);
            backgroundPressRef.current = null;
        }
    }, []);

    useEffect(() => () => {
        if (backgroundPressRef.current) {
            window.clearTimeout(backgroundPressRef.current.timeoutId);
        }
    }, []);

    useEffect(() => {
        onSelectedItemsChange?.(handlers.selectedItems || []);
    }, [handlers.selectedItems, onSelectedItemsChange]);

    const getObjectElement = useCallback((item: ObjectSelectionItem): HTMLElement | null => {
        const root = previewRootRef.current;
        if (!root) return null;
        if (item.type === 'category') return root.querySelector(`#${CSS.escape(`category-header-${item.id}`)}`);
        if (item.type === 'product' || item.type === 'freeText') return root.querySelector(`#${CSS.escape(`product-container-${item.id}`)}`);
        return Array.from(root.querySelectorAll<HTMLElement>('[data-added-image-id]'))
            .find((element) => element.dataset.addedImageId === item.id) || null;
    }, []);

    const focusedProductRef = useRef<string | null>(null);
    const [newTextToEdit, setNewTextToEdit] = useState<string | null>(null);
    const focusedNewText = useRef<string | null>(null);

    useEffect(() => {
        if (!newTextToEdit || !products.some(product => product.id === newTextToEdit)) return;
        const frame = requestAnimationFrame(() => {
            focusedNewText.current = newTextToEdit;
            handlers.startEditing(null, newTextToEdit);
            setNewTextToEdit(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [handlers.startEditing, newTextToEdit, products]);
    React.useLayoutEffect(() => {
        if (readOnly) return;
        const editingProductId = handlers.editingId
            && products.some((product) => product.id === handlers.editingId && (!product.isFreeText || focusedNewText.current === product.id))
            ? handlers.editingId
            : null;

        if (editingProductId && editingProductId !== focusedProductRef.current) {
            focusedProductRef.current = editingProductId;
            props.onProductEditStart?.(editingProductId);
        } else if (!editingProductId && focusedProductRef.current) {
            const clicked = handlers.selectedItems.find(item => item.id === handlers.selectedId && item.id !== focusedProductRef.current);
            const target = clicked && isObjectItem(clicked) ? getObjectElement(clicked) : null;
            focusedProductRef.current = null;
            focusedNewText.current = null;
            props.onProductEditEnd?.(target);
        }
    }, [getObjectElement, handlers.editingId, handlers.selectedId, handlers.selectedItems, products, props.onProductEditEnd, props.onProductEditStart, readOnly]);

    const productEditEndRef = useRef(props.onProductEditEnd);
    React.useLayoutEffect(() => {
        productEditEndRef.current = props.onProductEditEnd;
    }, [props.onProductEditEnd]);
    useEffect(() => () => {
        if (focusedProductRef.current) productEditEndRef.current?.();
    }, []);

    useEffect(() => {
        if (readOnly) return;
        const closeProductEditor = () => {
            if (!focusedProductRef.current) return;
            handlers.setEditingId(null);
            handlers.setFormattingTarget(null);
        };
        document.addEventListener('automenu:close-product-editor', closeProductEditor);
        return () => document.removeEventListener('automenu:close-product-editor', closeProductEditor);
    }, [handlers.setEditingId, handlers.setFormattingTarget, readOnly]);

    useEffect(() => {
        if (!objectMenu) return;

        const closeMenuIfOutside = (event: PointerEvent | MouseEvent) => {
            if (event.type === 'contextmenu' && lastPreviewPointerTypeRef.current === 'touch') {
                event.preventDefault();
                return;
            }
            const target = event.target as Node | null;
            if (target && objectMenuRef.current?.contains(target)) return;
            const trigger = target instanceof Element ? target.closest<HTMLElement>('[data-open-object-menu]') : null;
            if (trigger && trigger.dataset.objectMenuType === objectMenu.item?.type
                && trigger.dataset.objectMenuId === objectMenu.item?.id) return;
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
            const item = objectMenu.item;
            const root = previewRootRef.current;
            const buttonScope = root?.closest('[data-automenu-editor-canvas]')?.parentElement ?? root;
            const buttons = item && objectMenu.anchored ? Array.from(buttonScope?.querySelectorAll<HTMLElement>(
                `[data-object-menu-type="${item.type}"][data-object-menu-id="${CSS.escape(item.id)}"]`
            ) || []).filter(button => button.getBoundingClientRect().width && getComputedStyle(button).visibility === 'visible') : [];
            const button = buttons.find(button => Number(button.closest<HTMLElement>('[data-shortcut-page]')?.dataset.shortcutPage) === objectMenu.pageIndex) || buttons[0];
            const anchor = button?.getBoundingClientRect();
            const page = previewRootRef.current?.querySelector(`[data-menu-print-page][data-page-index="${objectMenu.pageIndex}"]`);
            const repeated = item?.type === 'addedImage' || item?.type === 'freeText'
                ? page?.querySelector(`[${item.type === 'addedImage' ? 'data-added-image-id' : 'data-canvas-free-text-id'}="${CSS.escape(item.id)}"]`)
                : null;
            const object = repeated || item && (isObjectItem(item) ? getObjectElement(item) : previewRootRef.current?.querySelector(
                `[data-header-page="${headingPageIndex(item.id)}"]`,
            ));
            const bounds = (item?.type === 'category' ? object?.closest('[data-category-chunk]') || object : object)?.getBoundingClientRect();
            const edge = 8;
            const gap = 8;
            const viewportBottom = window.innerHeight - edge;
            const viewportRight = window.innerWidth - edge;
            const maxHeight = Math.min(menu.scrollHeight + 2, Math.max(104, Math.round(window.innerHeight * .67)));
            const clampX = (x: number) => clamp(x, edge, Math.max(edge, viewportRight - rect.width));
            const clampY = (y: number, height: number) => clamp(y, edge, Math.max(edge, viewportBottom - height));
            const x = anchor?.left ?? bounds?.left ?? objectMenu.x;
            const y = anchor?.bottom ?? bounds?.top ?? objectMenu.y;
            let nextPosition = { left: clampX(x), top: clampY(y, maxHeight), maxHeight };
            if (bounds) {
                const leftSpace = bounds.left - gap - edge;
                const rightSpace = viewportRight - bounds.right - gap;
                const above = bounds.top - gap - edge;
                const below = viewportBottom - bounds.bottom - gap;
                if (item?.type === 'product' && below >= 104) {
                    nextPosition = { left: clampX(x), top: bounds.bottom + gap, maxHeight: Math.min(maxHeight, below) };
                } else if (Math.max(leftSpace, rightSpace) >= rect.width) {
                    const left = rightSpace >= rect.width ? bounds.right + gap : bounds.left - rect.width - gap;
                    nextPosition = { left: clampX(left), top: clampY(y, maxHeight), maxHeight };
                } else {
                    const available = Math.max(above, below);
                    const height = Math.min(maxHeight, Math.max(104, available));
                    const top = below >= above ? bounds.bottom + gap : bounds.top - gap - height;
                    nextPosition = { left: clampX(x), top: clampY(top, height), maxHeight: height };
                }
            }
            if (anchor && nextPosition.left < anchor.right && nextPosition.left + rect.width > anchor.left
                && nextPosition.top < anchor.bottom && nextPosition.top + nextPosition.maxHeight > anchor.top) {
                const above = anchor.top - gap - edge;
                const below = viewportBottom - anchor.bottom - gap;
                const height = Math.min(nextPosition.maxHeight, Math.max(above, below));
                nextPosition = { ...nextPosition, top: below >= above ? anchor.bottom + gap : anchor.top - gap - height, maxHeight: height };
            }
            setObjectMenuPosition((current) => (
                current?.left === nextPosition.left && current?.top === nextPosition.top && current?.maxHeight === nextPosition.maxHeight
                    ? current
                    : nextPosition
            ));
        };

        reposition();
        let pending = 0;
        const frame = requestAnimationFrame(() => { pending = requestAnimationFrame(reposition); });
        const resizeObserver = new ResizeObserver(reposition);
        if (objectMenuRef.current) resizeObserver.observe(objectMenuRef.current);
        window.addEventListener('resize', reposition);

        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(pending);
            resizeObserver.disconnect();
            window.removeEventListener('resize', reposition);
        };
    }, [getObjectElement, objectMenu]);

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
    const usedFonts = useMemo(() => getConfiguredCanvasFonts(style, products), [style, products]);

    const startCanvasScale = (event: React.PointerEvent<HTMLButtonElement>, target: CanvasScaleTarget, direction: -1 | 1) => {
        const frame = event.currentTarget.parentElement;
        if (!frame) return;
        const scale = getCanvasDragScale(frame);
        const startY = event.clientY;
        const gestureHeight = Math.max(44, frame.offsetHeight);
        const handle = event.currentTarget;
        const selection = handlers.selectedItems.length > 1 ? handlers.selectedItems : undefined;
        const scaleObject = captureCanvasObjectScale(style, target, products, frame.offsetWidth, () => {
            if (!handle.classList.contains('automenu-limit-feedback')) triggerLimitFeedback(handle);
        }, selection);
        let next: ReturnType<typeof scaleObject>;
        return {
            preview: (point: PointerEvent) => {
                const delta = (point.clientY - startY) * direction / scale;
                const proposed = scaleObject(1 + delta / gestureHeight);
                if (proposed) {
                    const nextStyle = proposed.style ? { ...style, ...proposed.style } : style;
                    const nextProducts = proposed.products
                        ? products.map(product => ({ ...product, ...proposed.products?.get(product.id) })) : products;
                    if (getCategoryFitRegression(products, style, nextProducts, nextStyle, props.sortOption)) {
                        if (!handle.classList.contains('automenu-limit-feedback')) triggerLimitFeedback(handle);
                        return;
                    }
                }
                next = proposed;
                setScalePreview(next);
            },
            finish: (commit: boolean) => {
                setScalePreview(undefined);
                if (!commit || !next) return;
                const { style: styleChange, products: productChanges } = next;
                if (styleChange && productChanges && props.onPasteObjects) {
                    props.onPasteObjects(products.map(product => ({ ...product, ...productChanges.get(product.id) })),
                        { ...style, ...styleChange, name: 'Custom' }, 'Redimensionar categoria');
                } else {
                    if (styleChange) onStyleUpdate?.(previous => ({ ...previous, ...styleChange, name: 'Custom' }));
                    const updates = Array.from(productChanges || []).flatMap(([id, change]) => [
                        { id, field: 'styles' as const, value: change.styles },
                        { id, field: 'freeTextWidth' as const, value: change.freeTextWidth },
                    ]);
                    if (updates.length && props.onUpdateProducts) props.onUpdateProducts(updates);
                    else updates.forEach(update => props.onUpdateProduct?.(update.id, update.field, update.value));
                }
            },
        };
    };
    const rotateCanvasImage = (id: string, rotation: number, commit: boolean) => {
        setRotationPreview(commit ? undefined : { type: 'addedImage', id, rotation });
        if (!commit) return;
        onStyleUpdate?.(previous => {
            const source = previous.addedImages?.find(image => image.id === id);
            if (!source || (source.shape?.rotation ?? source.rotation ?? 0) === rotation) return previous;
            const updated = rotateCanvasShape(source, rotation);
            return { ...previous, name: 'Custom', addedImages: previous.addedImages?.map(image => image.id === id ? updated : image) };
        });
    };
    const rotateCanvasText = (id: string, rotation: number, commit: boolean) => {
        setRotationPreview(commit ? undefined : { type: 'freeText', id, rotation });
        if (commit && (products.find(product => product.id === id)?.rotation ?? 0) !== rotation) {
            props.onUpdateProduct?.(id, 'rotation', rotation);
        }
    };
    Object.assign(handlers, {
        startCanvasScale, rotateCanvasImage, rotateCanvasText,
        isScalingCanvasObject: Boolean(scalePreview),
        liveTextRotation: rotationPreview?.type === 'freeText' ? rotationPreview : undefined,
    });

    // 4. Pagination
    const layoutStyle = useMemo(() => scalePreview?.style ? { ...style, ...scalePreview.style } : style, [style, scalePreview]);
    const layoutProducts = useMemo(() => scalePreview?.products
        ? products.map(product => {
            const change = scalePreview.products!.get(product.id);
            return change ? { ...product, ...change } : product;
        }) : products, [products, scalePreview]);
    const layoutGroups = useMemo(() => {
        if (!scalePreview?.products) return handlers.groupedProducts;
        return Object.fromEntries(Object.entries(handlers.groupedProducts).map(([key, group]) => [
            key, group.map(product => {
                const change = scalePreview.products!.get(product.id);
                return change ? { ...product, ...change } : product;
            }),
        ]));
    }, [handlers.groupedProducts, scalePreview]);
    const typographyScale = useMemo(() => getMenuTypographyScale(layoutStyle, layoutGroups, handlers.sortedCategories),
        [layoutStyle, layoutGroups, handlers.sortedCategories]);
    const paginationOptions = useMemo(() => ({ measuredHeights, typographyScale }), [measuredHeights, typographyScale]);
    const basePages = useMemo(() => {
        const effectiveCategoryPositions = handlers.liveCategoryPositions || layoutStyle.categoryPositions;
        const effectiveStyle = effectiveCategoryPositions === layoutStyle.categoryPositions
            ? layoutStyle
            : { ...layoutStyle, categoryPositions: effectiveCategoryPositions };
        return calculatePagination(
            layoutProducts,
            effectiveStyle,
            layoutGroups,
            handlers.sortedCategories,
            handlers.liveCategoryPageAssignments || getSavedCategoryPlacements(effectiveStyle),
            paginationOptions,
        );
    }, [layoutProducts, paginationOptions, layoutStyle, layoutGroups, handlers.sortedCategories, handlers.liveCategoryPageAssignments, handlers.liveCategoryPositions]);

    const canvasStyle = useMemo(() => {
        const current = handlers.liveCanvasLayers ? { ...layoutStyle, ...handlers.liveCanvasLayers } : layoutStyle;
        if (rotationPreview?.type !== 'addedImage') return current;
        return { ...current, addedImages: current.addedImages?.map(image =>
            image.id === rotationPreview.id ? rotateCanvasShape(image, rotationPreview.rotation) : image) };
    }, [handlers.liveCanvasLayers, layoutStyle, rotationPreview]);
    const pages = useMemo(() => finalizeMenuPages(basePages, handlers.liveCategoryPositions
        ? { ...canvasStyle, categoryPositions: handlers.liveCategoryPositions } : canvasStyle, layoutProducts),
    [basePages, canvasStyle, handlers.liveCategoryPositions, layoutProducts]);

    useMenuPageMeasurements(previewRootRef, pages, style.columnCount, setMeasuredHeights, typographyScale);

    useEffect(() => {
        onPageCountChange?.(pages.length);
    }, [onPageCountChange, pages.length]);

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

        return (type: 'category' | 'product' | 'freeText', id: string, adding = false) => {
            if (type === 'category') {
                const current = categoryPositions.get(id);
                const categoryOrder = handlers.sortedCategories.filter((category: string) => categoryPositions.has(category));
                const index = categoryOrder.indexOf(id);
                if (adding && index >= 0 && (style.categoryColumnCount || 1) > 1) {
                    let categoryNumber = 100;
                    while (handlers.groupedProducts[`Nova categoria ${categoryNumber}`]) categoryNumber++;
                    const newCategory = `Nova categoria ${categoryNumber}`;
                    const item: Product = { id: newCategory, name: 'Novo item', description: 'Descrição', category: newCategory, price: 0 };
                    const assignments = {
                        ...Object.fromEntries(Object.entries(style.categoryPositions || {}).map(([category, position]) => (
                            [category, { pageIndex: position.pageIndex, columnIndex: position.columnIndex }]
                        ))),
                        ...style.categoryPlacements,
                    };
                    const predict = (position: 'before' | 'after'): FlowDirection => {
                        const order = [...handlers.sortedCategories] as string[];
                        order.splice(order.indexOf(id) + (position === 'after' ? 1 : 0), 0, newCategory);
                        const result = calculatePagination(
                            [...products, item], style, { ...handlers.groupedProducts, [newCategory]: [item] }, order,
                            Object.keys(assignments).length ? assignments : null, {
                                splitCategoryAcrossPages: props.splitCategoryAcrossPages, measuredHeights,
                            },
                        );
                        const find = (category: string) => {
                            for (const [pageIndex, page] of result.entries()) {
                                for (const column of page.columns) {
                                    const rowIndex = column.chunks.findIndex(chunk => chunk.startsCategory && chunk.category === category);
                                    if (rowIndex !== -1) return { pageIndex, columnIndex: column.columnIndex, rowIndex, subColumnIndex: 0 };
                                }
                            }
                        };
                        const anchor = find(id);
                        const inserted = find(newCategory);
                        return anchor && inserted ? getDirectionBetween(anchor, inserted) : position === 'before' ? 'top' : 'bottom';
                    };
                    return { before: predict('before'), after: predict('after') };
                }
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
            const productColumnCount = getProductColumnCount(style, product?.category);
            const expectedAfter: FlowDirection = current && productColumnCount > 1 && current.subColumnIndex < productColumnCount - 1
                ? 'right'
                : 'bottom';
            if (adding && current && productColumnCount > 1) {
                return {
                    before: current.subColumnIndex > 0 || !previous ? 'left' : getDirectionBetween(current, previous),
                    after: expectedAfter === 'right' || !next ? expectedAfter : getDirectionBetween(current, next),
                };
            }

            return {
                before: current && previous ? getDirectionBetween(current, previous) : 'top',
                after: current && next ? getDirectionBetween(current, next) : expectedAfter,
            };
        };
    }, [handlers.groupedProducts, handlers.sortedCategories, measuredHeights, pages, products, props.splitCategoryAcrossPages, style]);

    (handlers as any).getFlowControlDirections = getFlowControlDirections;
    (handlers as any).getAddControlDirections = (type: 'category' | 'product' | 'freeText', id: string) => getFlowControlDirections(type, id, true);

    (handlers as any).updateItemFormatting = props.onItemFormattingUpdate;
    (handlers as any).handleInlineStyleChange = (target: any, newStyle: ElementStyle) => {
        const nextFontSize = Number(newStyle.fontSize);
        if (target.type === 'freeText') {
            const currentProduct = products.find(product => product.id === target.id);
            const previousFontFamily = currentProduct?.styles?.fontFamily || style.fontFamily;
            const currentFontSize = Number(
                currentProduct?.styles?.fontSize
                || style.elementStyles.productName?.fontSize
                || 18,
            );
            if (
                Number.isFinite(nextFontSize)
                && nextFontSize > currentFontSize
                && !canIncreaseCanvasFontSize('freeText', nextFontSize, target.elementId)
            ) return false;
            const fontSizeReduced = Number(newStyle.fontSize) > 0
                && Number(currentProduct?.styles?.fontSize) > 0
                && Number(newStyle.fontSize) < Number(currentProduct?.styles?.fontSize);
            props.onUpdateProduct?.(target.id, 'styles', newStyle);
            if (newStyle.fontFamily && newStyle.fontFamily !== previousFontFamily) {
                setPendingFontPropagation({ sourceId: target.id, fontFamily: newStyle.fontFamily });
            }
            if (fontSizeReduced) {
                onStyleUpdate?.(prev => ({ ...prev, pageBreaks: [] }));
            }
            return true;
        }

        const elementType: keyof MenuStyle['elementStyles'] =
            target.type === 'pageNumber' ? 'pageNumber' :
            target.type === 'category' ? 'category' :
                target.type === 'menuTitle' ? 'menuTitle' :
                    target.type === 'menuSubtitle' ? 'menuSubtitle' :
                        target.field === 'price' ? 'productPrice' :
                            target.field === 'description' ? 'productDescription' :
                                'productName';

        const { onItemFormattingUpdate } = props;
        if (onItemFormattingUpdate && (target.type === 'category' || target.type === 'product')) {
            onItemFormattingUpdate(target.type, target.id, previous => setElementFormatting(previous, elementType, newStyle));
        } else {
            onStyleUpdate?.(previous => setElementFormatting(previous, elementType, newStyle));
        }
        return true;
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

        if (!onStyleUpdate) return;
        const order = pages.map((_, index) => index);
        order.splice(insertIndex, 0, -1);
        onStyleUpdate(prev => reindexMenuPages(prev, pages, order));
        handlers.replaceSelectedItems([{ type: 'page', id: String(insertIndex) }]);
        window.setTimeout(() => {
            document
                .querySelector<HTMLElement>(`[data-page-index="${insertIndex}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 80);
    };

    const handleMovePage = (index: number, direction: 'before' | 'after') => {
        if (!onStyleUpdate) return;
        const selected = selectedPageIndexes.includes(index) ? selectedPageIndexes : [index];
        const first = Math.min(...selected);
        const last = Math.max(...selected);
        const offset = direction === 'before' ? -1 : 1;
        const neighbor = offset < 0 ? first - 1 : last + 1;
        if (neighbor < 0 || neighbor >= pages.length) return;
        const order = pages.map((_, pageIndex) => pageIndex);
        const slots = [...new Set([...selected, neighbor])].sort((left, right) => left - right);
        slots.forEach((slot, position) => {
            order[slot] = slots[(position - offset + slots.length) % slots.length];
        });
        onStyleUpdate(prev => reindexMenuPages(prev, pages, order));
        handlers.replaceSelectedItems(handlers.selectedItems.map(item => item.type === 'page'
            ? { ...item, id: String(order.indexOf(Number(item.id))) } : item));
    };

    const openPageRemoval = (index: number) => {
        handlers.setPageToDelete(index);
        handlers.setShowDeletePageConfirm(true);
        setObjectMenu(null);
    };

    const duplicatePage = (index: number) => {
        const page = pages[index];
        if (!page || !props.onPasteObjects) return;
        const copy = duplicateMenuPage(page, index, products, style);
        props.onPasteObjects(copy.products, copy.style, 'Duplicar página');
        handlers.replaceSelectedItems([{ type: 'page', id: String(copy.index) }]);
        setObjectMenu(null);
        requestAnimationFrame(() => {
            previewRootRef.current?.querySelector(`[data-blank-page-id="${copy.duplicateId}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
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
            }

            (pageToDelete.flatItems || []).forEach((item: any) => {
                if (item.category) categoriesOnDeletedPages.add(item.category);

                if (item.type === 'product-item' || item.type === 'product-row' || item.type === 'free-text-row') {
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

                const removedPages = new Set(pageIndexesToDelete);
                const shift = <T extends { pageIndex: number }>(value: T): T => ({
                    ...value, pageIndex: value.pageIndex - pageIndexesToDelete.filter(index => index < value.pageIndex).length,
                });
                const remainingAssets = <T extends { pageIndex: number }>(assets?: T[]) =>
                    assets?.filter(asset => !removedPages.has(asset.pageIndex)).map(shift);
                const shiftRecord = <T extends { pageIndex: number }>(record?: Record<string, T>) =>
                    record && Object.fromEntries(Object.entries(record).map(([id, value]) => [id, shift(value)]));

                return {
                    ...prev, hiddenProductIds: Array.from(currentHidden), pageBreaks: newPageBreaks, blankPages,
                    headingPages: remapHeadingPages(prev, page => removedPages.has(page) ? undefined
                        : page - pageIndexesToDelete.filter(index => index < page).length),
                    addedImages: prev.addedImages?.filter(image => image.repeatAsBackground || !removedPages.has(image.pageIndex)).map(shift),
                    floatingText: remainingAssets(prev.floatingText),
                    pageBackgrounds: remainingAssets(prev.pageBackgrounds),
                    categoryPlacements: shiftRecord(prev.categoryPlacements),
                    categoryPositions: shiftRecord(prev.categoryPositions),
                    freeTextBackgrounds: shiftRecord(prev.freeTextBackgrounds),
                    name: 'Custom',
                };
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

        const productIdsToDelete = new Set<string>();
        const categoriesToDelete = new Set<string>();
        const freeTextCategoriesToDelete = new Set<string>();
        const addedImageIdsToDelete = new Set<string>();

        selectedItems.forEach((item: any) => {
            if (item.type === 'category') {
                categoriesToDelete.add(item.id);
                return;
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find(candidate => candidate.id === item.id);
                productIdsToDelete.add(item.id);
                if (product?.isFreeText || item.type === 'freeText') {
                    if (product?.category.startsWith(FREE_TEXT_PREFIX)) {
                        freeTextCategoriesToDelete.add(product.category);
                    }
                }
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

        if (productIdsToDelete.size === 0 && categoriesToDelete.size === 0 && addedImageIdsToDelete.size === 0) {
            return false;
        }

        onStyleUpdate?.(prev => {
            const currentHidden = new Set(prev.hiddenProductIds || []);
            productIdsToDelete.forEach(productId => currentHidden.delete(productId));

            const nextProductOrder = { ...(prev.customProductOrder || {}) };
            Object.keys(nextProductOrder).forEach(category => {
                if (categoriesToDelete.has(category) || freeTextCategoriesToDelete.has(category)) {
                    delete nextProductOrder[category];
                    return;
                }
                nextProductOrder[category] = nextProductOrder[category].filter(productId => !productIdsToDelete.has(productId));
            });
            const nextCategoryPlacements = { ...(prev.categoryPlacements || {}) };
            const nextCategoryPositions = { ...(prev.categoryPositions || {}) };
            [...categoriesToDelete, ...freeTextCategoriesToDelete].forEach((category) => {
                delete nextCategoryPlacements[category];
                delete nextCategoryPositions[category];
            });

            return {
                ...prev,
                hiddenProductIds: Array.from(currentHidden),
                customCategoryOrder: (prev.customCategoryOrder || []).filter(category => (
                    !categoriesToDelete.has(category) && !freeTextCategoriesToDelete.has(category)
                )),
                customProductOrder: nextProductOrder,
                categoryPlacements: nextCategoryPlacements,
                categoryPositions: nextCategoryPositions,
                freeTextFills: prev.freeTextFills && Object.fromEntries(Object.entries(prev.freeTextFills).filter(([id]) => !productIdsToDelete.has(id))),
                freeTextBackgrounds: prev.freeTextBackgrounds && Object.fromEntries(
                    Object.entries(prev.freeTextBackgrounds).filter(([id]) => !productIdsToDelete.has(id)),
                ),
                addedImages: addedImageIdsToDelete.size > 0
                    ? (prev.addedImages || []).filter((img) => !addedImageIdsToDelete.has(img.id))
                    : prev.addedImages,
                name: 'Custom'
            };
        });

        productIdsToDelete.forEach(productId => onDeleteProduct?.(productId));
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
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-canvas-object-menu="true"]')) return;

    document.body.dataset.automenuDeleteContext = 'canvas';
    lastPreviewPointerTypeRef.current = event.pointerType;
    if (event.pointerType === 'touch') {
      const startedOnObjectMenuButton = Boolean(target?.closest('[data-open-object-menu="true"]'));
      touchStartedOnObjectMenuButtonRef.current = startedOnObjectMenuButton;
      suppressTouchObjectMenuUntilRef.current = startedOnObjectMenuButton ? 0 : Date.now() + 1400;
      if (!startedOnObjectMenuButton) setObjectMenu(null);
    }
        const pageElement = target?.closest<HTMLElement>('[data-menu-print-page="true"][data-page-index]');
        if (pageElement) {
            lastCanvasPointRef.current = { x: event.clientX, y: event.clientY };
            lastPastePosition.current = pastePosition(lastCanvasPointRef.current);
        }
        if (handlers.editingId && event.button === 0 && pageElement
            && target?.closest('[data-drag-id], [data-category-id], [data-added-image-drag], [data-menu-heading]')
            && !target.closest('button, input, textarea, select')) {
            const field = target.closest<HTMLElement>('[contenteditable="true"]');
            const isCurrentObject = field?.dataset.productEditId === handlers.editingId
                || field?.id === `text-${handlers.editingId}`;
            // A focus change can scroll or reflow the canvas before the pointer is released.
            if (!isCurrentObject) event.preventDefault();
        }

        const heading = target?.closest<HTMLElement>('[data-menu-heading]');
        const headingHit = heading && isHeadingTextHit(heading, event);
        const headingType = heading?.dataset.menuHeading === 'title' ? 'menuTitle' : 'menuSubtitle';
        const isBlankTouchTarget = Boolean(
            pageElement
            && event.pointerType === 'touch'
            && !headingHit
            && !target?.closest(
                '[data-drag-type], [data-added-image-drag="true"], button, input, textarea, select, [contenteditable="true"], [data-drag-ignore="true"], [data-inline-format-toolbar="true"]'
            )
        );
        const isHeadingLongPress = pageElement && event.pointerType === 'touch' && headingHit && !heading?.isContentEditable;
        if (isBlankTouchTarget || isHeadingLongPress) {
            if (backgroundPressRef.current) window.clearTimeout(backgroundPressRef.current.timeoutId);
            const pointerId = event.pointerId;
            const startX = event.clientX;
            const startY = event.clientY;
            const timeoutId = window.setTimeout(() => {
                const press = backgroundPressRef.current;
                if (!press || press.pointerId !== pointerId) return;
                backgroundPressRef.current = null;
                suppressBackgroundPressClickRef.current = true;
                const pageIndex = Number(pageElement?.dataset.pageIndex);
                const item = isHeadingLongPress ? { type: headingType, id: headingSelectionId(headingType, pageIndex) } as const : null;
                if (item && !handlers.selectedItems.some(selected => isHeadingSelectionOnPage(selected, pageIndex))) {
                    handlers.handleSelection(item.type, item.id);
                }
                if (!item && !handlers.multiSelectMode) handlers.handleSelection(null, null);
                handlers.setEditingId(null);
                setObjectMenuPosition(null);
                setObjectMenu({ x: startX, y: startY, item, pageIndex, anchored: Boolean(item),
                    pasteAt: item ? undefined : lastPastePosition.current ?? undefined });
                window.setTimeout(() => { suppressBackgroundPressClickRef.current = false; }, 800);
            }, 480);
            backgroundPressRef.current = { pointerId, startX, startY, timeoutId };
        }

        if (
            !pageElement
            || event.pointerType !== 'mouse'
            || event.button !== 0
            || Boolean(document.body.dataset.automenuImageInteraction)
            || target?.closest(
                '[data-drag-type], [data-added-image-drag="true"], [data-menu-heading], button, input, textarea, select, [contenteditable="true"], [data-drag-ignore="true"], [data-inline-format-toolbar="true"]'
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
        const backgroundPress = backgroundPressRef.current;
        if (
            backgroundPress
            && backgroundPress.pointerId === event.pointerId
            && Math.hypot(event.clientX - backgroundPress.startX, event.clientY - backgroundPress.startY) >= 8
        ) {
            window.clearTimeout(backgroundPress.timeoutId);
            backgroundPressRef.current = null;
        }
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
        const backgroundPress = backgroundPressRef.current;
        if (backgroundPress?.pointerId === event.pointerId) {
            window.clearTimeout(backgroundPress.timeoutId);
            backgroundPressRef.current = null;
        }
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

    const getFreeTextPlacementFromPoint = useCallback((point: { x: number; y: number } | null, shiftExistingTexts = true): DraftItem | null => {
        const pageEls = Array.from(previewRootRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]') || []);
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
        let clickY = clamp(((point?.y ?? pageRect.top + menuMargins.top) - pageRect.top) / currentScale, 0, pageDimensions.heightPx);

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
        const columnRect = clickedColumnEl?.getBoundingClientRect();

        let floorId: string | null = null;
        let floorBottom = ((columnRect?.top ?? (pageRect.top + (menuMargins.top * currentScale))) - pageRect.top) / currentScale;
        let ceilingId: string | null = null;
        let ceilingTop = pageDimensions.heightPx;
        let minDistAbove = Infinity;
        let minDistBelow = Infinity;
        const searchRoot = clickedColumnEl || pageEl;
        const minimumClientTop = columnRect?.top ?? pageRect.top + (menuMargins.top * currentScale);
        const maximumClientBottom = pageRect.bottom - ((menuMargins.bottom + SAFETY_BUFFER) * currentScale);
        const freeTextHeight = 40 * currentScale;
        const desiredClientTop = clamp(
            pageRect.top + (clickY * currentScale),
            minimumClientTop,
            maximumClientBottom - freeTextHeight,
        );
        const freeTextProducts = new Map(products.filter((product) => product.isFreeText).map((product) => [product.id, product]));
        const renderedFreeTexts = Array.from(searchRoot.querySelectorAll<HTMLElement>('[id^="product-container-"]'))
            .map((element) => {
                const productId = element.id.replace('product-container-', '');
                const product = freeTextProducts.get(productId);
                if (!product || !product.category.startsWith(FREE_TEXT_PREFIX)) return null;
                return {
                    category: product.category,
                    productId,
                    element,
                    rect: element.getBoundingClientRect(),
                };
            })
            .filter((item): item is { category: string; productId: string; element: HTMLElement; rect: DOMRect } => Boolean(item))
            .sort((left, right) => left.rect.top - right.rect.top);
        const overlapsInsertion = (rect: DOMRect) => (
            desiredClientTop < rect.bottom + (6 * currentScale)
            && desiredClientTop + freeTextHeight > rect.top - (6 * currentScale)
        );
        const overlappingFreeTexts = renderedFreeTexts.filter(({ rect }) => overlapsInsertion(rect));
        const freeTextElements = new Set(
            overlappingFreeTexts.map(({ element }) => element),
        );
        const hasNonFreeTextCollision = Array.from(pageEl.querySelectorAll<HTMLElement>(
            '[id^="product-container-"], [id^="category-header-"], [data-menu-heading], [data-added-image-drag="true"]',
        )).some((element) => {
            if (freeTextElements.has(element)) return false;
            const rect = element.getBoundingClientRect();
            const sharesColumn = rect.right > (columnRect?.left ?? pageRect.left)
                && rect.left < (columnRect?.right ?? pageRect.right);
            return sharesColumn && overlapsInsertion(rect);
        });

        let rippleClientTop: number | null = null;
        let firstShiftedProductId: string | null = null;
        let freeTextPositionUpdates: DraftItem['freeTextPositionUpdates'];
        if (shiftExistingTexts && overlappingFreeTexts.length > 0 && !hasNonFreeTextCollision) {
            const updates: NonNullable<DraftItem['freeTextPositionUpdates']> = {};
            let cursorY = ((desiredClientTop - pageRect.top) / currentScale) + 40 + NUDGE_STEP;
            let targetPageIndex = pageIndex;
            const maximumBottom = pageDimensions.heightPx - menuMargins.bottom - SAFETY_BUFFER;

            renderedFreeTexts.forEach(({ category, productId, rect }) => {
                const currentTop = (rect.top - pageRect.top) / currentScale;
                const currentHeight = rect.height / currentScale;
                if (rect.bottom + (6 * currentScale) <= desiredClientTop) return;

                let nextTop = targetPageIndex === pageIndex ? Math.max(currentTop, cursorY) : cursorY;
                if (nextTop + currentHeight > maximumBottom) {
                    targetPageIndex += 1;
                    nextTop = menuMargins.top;
                }
                if (targetPageIndex !== pageIndex || nextTop > currentTop + 0.25) {
                    if (!firstShiftedProductId) firstShiftedProductId = productId;
                    updates[category] = { pageIndex: targetPageIndex, columnIndex, y: nextTop };
                }
                cursorY = nextTop + currentHeight + NUDGE_STEP;
            });

            if (Object.keys(updates).length > 0) {
                rippleClientTop = desiredClientTop;
                freeTextPositionUpdates = updates;
            }
        }

        const safeClientTop = rippleClientTop ?? getCollisionSafeFreeTextTop({
            root: pageEl,
            desiredTop: desiredClientTop,
            height: freeTextHeight,
            pointerY: point?.y ?? pageRect.top + (clickY * currentScale),
            minTop: minimumClientTop,
            maxBottom: maximumClientBottom,
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

        if (firstShiftedProductId && !ceilingId) {
            ceilingId = firstShiftedProductId;
            const firstShifted = renderedFreeTexts.find(({ productId }) => productId === firstShiftedProductId);
            if (firstShifted) ceilingTop = (firstShifted.rect.top - pageRect.top) / currentScale;
        }

        return {
            pageIndex,
            columnIndex,
            top: clickY,
            floorId,
            floorBottom,
            ceilingId,
            ceilingTop,
            freeTextPositionUpdates,
        };
    }, [pageDimensions.heightPx, products, props.scale, style.categoryPositions, style.margins, style.pagePadding]);

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

    const pastePosition = (point: { x: number; y: number } | null, target?: ObjectSelectionItem | null): CategoryPosition => {
        const rect = target && getObjectElement(target)?.getBoundingClientRect();
        const location = rect ? { x: rect.left, y: rect.top } : point || lastCanvasPointRef.current;
        const pages = Array.from(previewRootRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page][data-page-index]') || []);
        const page = (target && getObjectElement(target)?.closest<HTMLElement>('[data-menu-print-page]')) || pages.find(el => {
            const r = el.getBoundingClientRect();
            return location && location.x >= r.left && location.x <= r.right && location.y >= r.top && location.y <= r.bottom;
        }) || pages[0];
        if (!page || !location) return { pageIndex: 0, columnIndex: 0, pageX: 48, y: 48 };
        const bounds = page.getBoundingClientRect();
        const scale = bounds.width / pageDimensions.widthPx || 1;
        const columns = Array.from(page.querySelectorAll<HTMLElement>('[data-drag-column-container="category"]'));
        const column = columns.reduce((nearest, el) => {
            const distance = (element: HTMLElement) => { const r = element.getBoundingClientRect(); return Math.max(r.left - location.x, location.x - r.right, 0); };
            return distance(el) < distance(nearest) ? el : nearest;
        }, columns[0]);
        return { pageIndex: Number(page.dataset.pageIndex), columnIndex: Number(column?.dataset.dragColumnIndex || 0),
            pageX: clamp((location.x - bounds.left) / scale, 0, pageDimensions.widthPx - 1),
            y: clamp((location.y - bounds.top) / scale, 0, pageDimensions.heightPx - 1) };
    };

    const readNativeClipboardPayload = useCallback(async (): Promise<NativeClipboardPayload | null> => {
        const clipboard = navigator.clipboard as (Clipboard & { read?: () => Promise<globalThis.ClipboardItem[]> }) | undefined;
        if (!clipboard) return null;

        try {
            const items = clipboard.read ? await clipboard.read() : [];
            let htmlImage: string | null = null;
            for (const item of items.filter(i => i.types.includes('text/html'))) {
                const html = await item.getType('text/html').then(blob => blob.text()).catch(() => '');
                const clip = matchingCanvasCopy(html);
                if (clip) return { type: 'objects', clip };
                htmlImage ??= clipboardImageUrl(html);
            }
            for (const item of items) {
                for (const type of item.types.filter(type => type.startsWith('image/'))) {
                    const blob = await item.getType(type).catch(() => null);
                    if (blob?.size) return { type: 'image', blob };
                }
            }
            if (htmlImage) return { type: 'imageUrl', url: htmlImage };
            for (const item of items.filter(i => i.types.includes('text/plain'))) {
                const text = await item.getType('text/plain').then(blob => blob.text()).catch(() => '');
                if (text) return { type: 'text', text };
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

    const getUniqueCategoryName = useCallback((baseName: string) => {
        return categoryKey(categoryName(baseName), products.map(p => p.category));
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
        ...copiedProductFields(product),
        categoryId: categoryId ?? product.categoryId ?? null,
    });

    const buildClipboardItems = useCallback((items: ObjectSelectionItem[]): CopiedObject[] => (
        items.flatMap((item): CopiedObject[] => {
            if (item.type === 'category') {
                return [{
                    type: 'category',
                    category: item.id,
                    products: handlers.groupedProducts[item.id] || products.filter(p => p.category === item.id),
                }];
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find((candidate) => candidate.id === item.id);
                if (!product || items.some(entry => entry.type === 'category' && entry.id === product.category)) return [];
                return [{ type: product.isFreeText ? 'freeText' : 'product', product }];
            }

            const image = (style.addedImages || []).find((candidate) => candidate.id === item.id);
            return image ? [{ type: 'addedImage', image }] : [];
        })
    ), [handlers.groupedProducts, products, style.addedImages]);

    const snapshotItems = (items: ObjectSelectionItem[]): CanvasClip => ({
        items: buildClipboardItems(items), positions: Object.fromEntries(items.map(item => [item.id, pastePosition(null, item)])),
        style: { categoryImages: style.categoryImages, categoryDividerStyles: style.categoryDividerStyles, productDividerStyles: style.productDividerStyles,
            hiddenProductIds: style.hiddenProductIds, productPhotoCrops: style.productPhotoCrops, productPhotoAlignments: style.productPhotoAlignments, productImageFlips: style.productImageFlips, freeTextBorders: style.freeTextBorders, freeTextFills: style.freeTextFills },
    });
    const copyItems = (items: ObjectSelectionItem[]) => {
        const clip = snapshotItems(items);
        if (!clip.items.length) return false;
        writeCanvasCopy(clip);
        setClipboardVersion(version => version + 1);
        return true;
    };

    const copyFormatting = useCallback((source?: FormatObject | null) => {
        if (!source) return false;
        const format = captureCanvasFormat(source, style, products);
        if (!format) return false;
        formatClipboardRef.current = { format, source, armed: true };
        setClipboardVersion(version => version + 1);
        setObjectMenu(null);
        return true;
    }, [products, style]);

    const insertCategoryAfter = useCallback((categoryOrder: string[], anchorCategory: string, nextCategory: string) => {
        const nextOrder = categoryOrder.filter((category) => category !== nextCategory);
        const anchorIndex = nextOrder.indexOf(anchorCategory);
        nextOrder.splice(anchorIndex === -1 ? nextOrder.length : anchorIndex + 1, 0, nextCategory);
        return nextOrder;
    }, []);

    const insertFreeTextProduct = useCallback((product: Product, placement?: DraftItem | null, indexOffset: number = 0) => {
        if (!onAddProduct || !onStyleUpdate) return false;

        const newId = crypto.randomUUID();
        const ghostCategory = `${FREE_TEXT_PREFIX}${newId}`;

        if (!placement) return false;

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

        const newItemTop = Math.max(0, placement.top + (indexOffset * 46));

        onStyleUpdate(prev => {
            const currentOrder = getCurrentOrder(prev.customCategoryOrder);
            const insertIndex = getPlacementInsertIndex(currentOrder);
            currentOrder.splice(insertIndex + indexOffset, 0, ghostCategory);
            const shiftedPlacements = Object.fromEntries(
                Object.entries(placement.freeTextPositionUpdates || {}).map(([category, position]) => [
                    category,
                    { pageIndex: position.pageIndex, columnIndex: position.columnIndex },
                ]),
            );

            return {
                ...prev,
                customCategoryOrder: currentOrder,
                customProductOrder: { ...(prev.customProductOrder || {}), [ghostCategory]: [newId] },
                freeTextFills: prev.freeTextFills?.[product.id] ? { ...prev.freeTextFills, [newId]: prev.freeTextFills[product.id] } : prev.freeTextFills,
                freeTextBorders: prev.freeTextBorders?.[product.id] ? { ...prev.freeTextBorders, [newId]: prev.freeTextBorders[product.id] } : prev.freeTextBorders,
                categoryPlacements: {
                    ...(prev.categoryPlacements || {}),
                    ...shiftedPlacements,
                    [ghostCategory]: {
                        pageIndex: placement.pageIndex,
                        columnIndex: placement.columnIndex,
                    },
                },
                categoryPositions: {
                    ...(prev.categoryPositions || {}),
                    ...(placement.freeTextPositionUpdates || {}),
                    [ghostCategory]: {
                        pageIndex: placement.pageIndex,
                        columnIndex: placement.columnIndex,
                        y: newItemTop,
                        pageX: placement.pageX,
                    },
                },
                name: 'Custom',
            };
        });

        onAddProduct(ghostCategory, undefined, true, newId, {
            name: product.name || 'Novo texto',
            description: product.description || '',
            price: product.price || 0,
            customMarginTop: 0,
            styles: { ...(product.styles || {}) },
        });

        return newId;
    }, [handlers.sortedCategories, onAddProduct, onStyleUpdate, products]);

    const duplicateClipboardItems = useCallback((clipboardItems: CopiedObject[], freeTextPlacement?: DraftItem | null, selection?: ObjectSelectionItem[]) => {
        if (clipboardItems.length === 0) return false;

        const addedImages = clipboardItems.filter((item): item is Extract<CopiedObject, { type: 'addedImage' }> => item.type === 'addedImage');
        const nonImageItems = clipboardItems.filter((item) => item.type !== 'addedImage');
        const created: ObjectSelectionItem[] = [];

        if (addedImages.length > 0 && onStyleUpdate) {
            const clones = addedImages.map(({ image }) => ({
                ...image,
                id: crypto.randomUUID(),
                x: Math.min(image.x + 20, Math.max(0, pageDimensions.widthPx - Math.min(image.width, 50))),
                y: Math.min(image.y + 20, Math.max(0, pageDimensions.heightPx - 50)),
            }));
            created.push(...clones.map(image => ({ type: 'addedImage' as const, id: image.id })));
            onStyleUpdate(prev => {
                const images = prev.addedImages || [];
                return { ...prev, addedImages: [...images, ...clones.map(image => ({ ...image, zIndex: 1 }))], name: 'Custom' };
            });
        }

        nonImageItems.forEach((item, index) => {
            if (item.type === 'product') {
                const newId = crypto.randomUUID();
                if (onAddProduct) created.push({ type: 'product', id: newId });
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
                const id = insertFreeTextProduct(item.product, freeTextPlacement, index);
                if (id) created.push({ type: 'freeText', id });
                return;
            }

            if (item.type === 'category') {
                const newCategory = getUniqueCategoryName(item.category);
                const categoryId = crypto.randomUUID();
                const productIds = item.products.map(() => crypto.randomUUID());
                if (onAddProduct && productIds.length) created.push({ type: 'category', id: newCategory });

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

        if (selection && created.some(item => item.type === 'addedImage')) {
            const [active] = created.splice(addedImages.length - 1, 1);
            handlers.setEditingId(null);
            handlers.replaceSelectedItems([...selection, ...created, active], true);
        }
        return true;
    }, [getCategoryOrder, getUniqueCategoryName, handlers.groupedProducts, handlers.replaceSelectedItems, handlers.setEditingId,
        insertFreeTextProduct, onAddProduct, onStyleUpdate, pageDimensions.heightPx, pageDimensions.widthPx]);

    const deleteObjectItems = useCallback((items: ObjectSelectionItem[]) => {
        if (items.length === 0) return false;

        const productIdsToDelete = new Set<string>();
        const categoriesToDelete = new Set<string>();
        const freeTextCategoriesToDelete = new Set<string>();
        const addedImageIdsToDelete = new Set<string>();

        items.forEach((item) => {
            if (item.type === 'category') {
                categoriesToDelete.add(item.id);
                return;
            }

            if (item.type === 'product' || item.type === 'freeText') {
                const product = products.find((candidate) => candidate.id === item.id);
                productIdsToDelete.add(item.id);
                if (product?.isFreeText || item.type === 'freeText') {
                    if (product?.category.startsWith(FREE_TEXT_PREFIX)) {
                        freeTextCategoriesToDelete.add(product.category);
                    }
                }
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
            productIdsToDelete.forEach(productId => currentHidden.delete(productId));

            const nextProductOrder = { ...(prev.customProductOrder || {}) };
            Object.keys(nextProductOrder).forEach(category => {
                if (categoriesToDelete.has(category) || freeTextCategoriesToDelete.has(category)) {
                    delete nextProductOrder[category];
                    return;
                }
                nextProductOrder[category] = nextProductOrder[category].filter(productId => !productIdsToDelete.has(productId));
            });
            const nextCategoryPlacements = { ...(prev.categoryPlacements || {}) };
            const nextCategoryPositions = { ...(prev.categoryPositions || {}) };
            [...categoriesToDelete, ...freeTextCategoriesToDelete].forEach((category) => {
                delete nextCategoryPlacements[category];
                delete nextCategoryPositions[category];
            });

            return {
                ...prev,
                hiddenProductIds: Array.from(currentHidden),
                customCategoryOrder: (prev.customCategoryOrder || []).filter(category => (
                    !categoriesToDelete.has(category) && !freeTextCategoriesToDelete.has(category)
                )),
                customProductOrder: nextProductOrder,
                categoryPlacements: nextCategoryPlacements,
                categoryPositions: nextCategoryPositions,
                freeTextFills: prev.freeTextFills && Object.fromEntries(Object.entries(prev.freeTextFills).filter(([id]) => !productIdsToDelete.has(id))),
                freeTextBackgrounds: prev.freeTextBackgrounds && Object.fromEntries(
                    Object.entries(prev.freeTextBackgrounds).filter(([id]) => !productIdsToDelete.has(id)),
                ),
                addedImages: addedImageIdsToDelete.size > 0
                    ? (prev.addedImages || []).filter((image) => !addedImageIdsToDelete.has(image.id))
                    : prev.addedImages,
                name: 'Custom',
            };
        });

        productIdsToDelete.forEach((productId) => onDeleteProduct?.(productId));
        handlers.handleSelection(null, null);
        return true;
    }, [handlers, onDeleteProduct, onStyleUpdate, products]);

    const commitPaste = (content: PasteContent, target: ObjectSelectionItem | null, position: CategoryPosition) => {
        const pasted = pasteCanvasObjects(products, style, content, target, position, {
            categories: handlers.sortedCategories, products: handlers.groupedProducts,
        });
        if (!pasted || !props.onPasteObjects) return false;
        props.onPasteObjects(pasted.products, pasted.style);
        if (handlers.editingId && !pasted.selection.some(item => item.id === handlers.editingId)) handlers.setEditingId(null);
        handlers.replaceSelectedItems(pasted.selection);
        return true;
    };
    const latestCommit = useRef(commitPaste);
    latestCommit.current = commitPaste;
    const pastePayload = async (payload: NativeClipboardPayload, target: ObjectSelectionItem | null, position: CategoryPosition) => {
        let content: PasteContent;
        if (payload.type === 'image' || payload.type === 'imageUrl') {
            const url = payload.type === 'imageUrl' ? payload.url : await blobToDataUrl(payload.blob);
            const image = { id: '', url, x: 0, y: 0, width: 300, pageIndex: 0 };
            content = { items: [{ type: 'addedImage', image }], positions: {}, style: {} };
        } else content = payload.type === 'objects' ? payload.clip : { text: payload.text };
        return latestCommit.current(content, target, position);
    };
    const [pasteRequest, setPasteRequest] = useState<{ target: ObjectSelectionItem | null; position: CategoryPosition } | null>(null);
    const pasteClipboard = async (targetItem?: ObjectSelectionItem | null) => {
        const target = targetItem === undefined ? getActiveObjectItems().slice(-1)[0] ?? null : targetItem;
        const position = objectMenu?.pasteAt ?? (target ? null : lastPastePosition.current) ?? pastePosition(objectMenu, target);
        const payload = await readNativeClipboardPayload();
        if (payload) return pastePayload(payload, target, position);
        setPasteRequest({ target, position });
        return true;
    };

    const pasteFormattingClipboard = useCallback((targets: FormatObject[]) => {
        const clipboard = formatClipboardRef.current;
        if (!clipboard) return false;
        const { format } = clipboard;
        const compatible = targets.filter(target => acceptsCanvasFormat(format, target));
        if (!compatible.length) return false;

        clipboard.armed = false;
        onStyleUpdate?.(previous => {
            if (clipboard.headings && compatible.some(target => target.type === 'menuTitle' || target.type === 'menuSubtitle')) {
                return menuHeadingFields.reduce((current, type) => {
                    const headingFormat = clipboard.headings?.[type];
                    return headingFormat ? applyCanvasFormat(current, headingFormat, [{ type, id: type }]) : current;
                }, previous);
            }
            return applyCanvasFormat(previous, format, compatible);
        });
        if (format.type === 'text') {
            const updates = compatible.filter(target => target.type === 'freeText').flatMap(({ id }) => [
                { id, field: 'styles' as const, value: { ...format.text } },
                ...(format.freeTextWidth === undefined ? [] : [{ id, field: 'freeTextWidth' as const, value: format.freeTextWidth }]),
            ]);
            if (updates.length && props.onUpdateProducts) props.onUpdateProducts(updates);
            else updates.forEach(({ id, field, value }) => props.onUpdateProduct?.(id, field, value));
        }
        setObjectMenu(null);
        return true;
    }, [onStyleUpdate, props.onUpdateProduct, props.onUpdateProducts]);

    const pasteFormattingOnClick = (event: React.MouseEvent) => {
        const clipboard = formatClipboardRef.current;
        const element = event.target;
        if (!clipboard?.armed || !(element instanceof Element) || element.closest('button, input, textarea, select, [data-print-control]:not([data-image-selection-overlay])')) return;
        clipboard.armed = false;
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

        const layer = element.closest<HTMLElement>('[data-added-image-id], [data-image-selection-overlay]');
        const heading = element.closest<HTMLElement>('[data-menu-heading]');
        const product = element.closest<HTMLElement>('[data-drag-type="product"][data-drag-id]');
        const category = element.closest<HTMLElement>('[data-category-id]');
        let target: FormatObject | undefined;
        if (layer) {
            const id = layer.dataset.addedImageId || layer.dataset.imageSelectionOverlay;
            if (id) target = { type: 'addedImage', id };
        } else if (heading && isHeadingTextHit(heading, event)) {
            const type = heading.dataset.menuHeading === 'title' ? 'menuTitle' : 'menuSubtitle';
            target = { type, id: headingSelectionId(type, Number(heading.closest<HTMLElement>('[data-page-index]')?.dataset.pageIndex || 0)) };
        } else if (product?.dataset.dragId) {
            const id = product.dataset.dragId;
            target = { type: products.find(item => item.id === id)?.isFreeText ? 'freeText' : 'product', id };
        } else if (category?.dataset.categoryId) {
            target = { type: 'category', id: category.dataset.categoryId };
        }

        if (target && (target.type !== clipboard.source.type || target.id !== clipboard.source.id)) {
            pasteFormattingClipboard([target]);
        }
    };

    function canLayerObjects(current: MenuStyle, items: ObjectSelectionItem[], direction: 'front' | 'back') {
        const imageIds = items.filter(item => item.type === 'addedImage').map(item => item.id);
        const contentCanMove = items.some(item => {
            if (item.type === 'addedImage') return false;
            if (item.type === 'freeText' && current.freeTextBackgrounds?.[item.id]) return false;
            const layer = item.type === 'freeText' ? getFreeTextLayer(current, item.id) : getContentLayer(current);
            return direction === 'front' ? layer === 2 && hasForegroundImage(current) : layer === 4;
        });
        return contentCanMove || canMoveImageLayer(current.addedImages || [], imageIds, direction);
    }

    const layerObjectItems = useCallback((items: ObjectSelectionItem[], direction: 'front' | 'back') => {
        if (!canLayerObjects(style, items, direction)) return false;
        onStyleUpdate?.(previous => {
            const images = previous.addedImages || [];
            const imageIds = items.filter(item => item.type === 'addedImage').map(item => item.id);
            const nextImageLayers = getImageLayerIndexes(images, imageIds, direction);
            const layer = direction === 'front' ? 4 : 2;
            const canRaise = direction === 'back' || hasForegroundImage(previous);
            const freeTexts = canRaise ? items.filter(item => item.type === 'freeText' && !previous.freeTextBackgrounds?.[item.id]) : [];
            return {
                ...previous,
                contentLayer: canRaise && items.some(item => item.type === 'category' || item.type === 'product')
                    ? direction : previous.contentLayer,
                freeTextLayers: freeTexts.length ? {
                    ...previous.freeTextLayers, ...Object.fromEntries(freeTexts.map(item => [item.id, layer])),
                } : previous.freeTextLayers,
                addedImages: nextImageLayers.size ? images.map(image => {
                    const zIndex = nextImageLayers.get(image.id);
                    return zIndex === undefined ? image : { ...image, zIndex };
                }) : previous.addedImages,
                name: 'Custom',
            };
        });
        return true;
    }, [onStyleUpdate, style]);

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
        if (action === 'copyFormat') handled = copyFormatting(targetItem ?? items[0]);
        if (action === 'paste') handled = await pasteClipboard(targetItem);
        if (action === 'pasteFormat') handled = pasteFormattingClipboard(items);
        if (action === 'cut') {
            handled = copyItems(items);
            if (handled) deleteObjectItems(items);
        }
        if (action === 'duplicate') {
            const clipboardItems = buildClipboardItems(items);
            const includesLayer = clipboardItems.some(item => item.type === 'addedImage');
            const placement = includesLayer && clipboardItems.some(item => item.type === 'freeText') ? getFreeTextPastePlacement(null, targetItem) : null;
            handled = duplicateClipboardItems(clipboardItems, placement, items);
        }
        if (action === 'delete') handled = deleteObjectItems(items);
        if (action === 'hide') handled = hideObjectItems(items);
        if (action === 'front') handled = layerObjectItems(items, 'front');
        if (action === 'back') handled = layerObjectItems(items, 'back');

        if (handled) setObjectMenu(null);
        return handled;
    }, [buildClipboardItems, copyFormatting, copyItems, deleteObjectItems, duplicateClipboardItems, getActiveObjectItems, getFreeTextPastePlacement, hideObjectItems, layerObjectItems, pasteClipboard, pasteFormattingClipboard]);

    (handlers as typeof handlers & { removeCanvasObject: (item: ObjectSelectionItem) => void }).removeCanvasObject = (item) => {
        void runObjectAction('delete', item);
    };

    useEffect(() => {
        if (readOnly) return;
        if (props.externalAction?.type !== 'APPEND_FREE_TEXT') return;
        if (handledExternalActionIdRef.current === props.externalAction.id) return;
        handledExternalActionIdRef.current = props.externalAction.id;

        const focus = getCanvasViewportFocus(previewRootRef.current?.closest<HTMLElement>('[data-automenu-editor-canvas]'));
        const nearby = focus ? getFreeTextPlacementFromPoint(focus.point, false) : getLastFreeTextPlacement();
        const placement = focus ? {
            pageIndex: focus.pageIndex,
            columnIndex: nearby?.columnIndex ?? focus.columnIndex,
            top: nearby && nearby.top >= focus.visibleTop && nearby.top + 26 <= focus.visibleBottom
                ? nearby.top : clamp(focus.y - 14, 0, pageDimensions.heightPx - 32),
            pageX: clamp(focus.x - 48, 0, pageDimensions.widthPx - 96),
            floorId: nearby?.floorId ?? null,
            floorBottom: nearby?.floorBottom ?? 0,
            ceilingId: nearby?.ceilingId ?? null,
            ceilingTop: nearby?.ceilingTop ?? pageDimensions.heightPx,
        } : nearby;
        const id = insertFreeTextProduct({
            id: '',
            name: 'Novo texto',
            description: '',
            price: 0,
            category: '',
            isFreeText: true,
        }, placement);
        if (id) setNewTextToEdit(id);
    }, [getLastFreeTextPlacement, getFreeTextPlacementFromPoint, insertFreeTextProduct, pageDimensions.heightPx, pageDimensions.widthPx, props.externalAction, readOnly]);

    const openObjectMenu = useCallback((event: React.MouseEvent, item: CanvasContextMenuItem) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldSuppressTouchMenu = lastPreviewPointerTypeRef.current === 'touch'
            && !touchStartedOnObjectMenuButtonRef.current
            && Date.now() < suppressTouchObjectMenuUntilRef.current;
        if ((event.type === 'contextmenu' && lastPreviewPointerTypeRef.current === 'touch') || shouldSuppressTouchMenu) {
            return;
        }
        if (handlers.draggedItem || handlers.draggedImageId) {
            setObjectMenu(null);
            return;
        }

        const page = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-page-index], [data-object-page-index], [data-shortcut-page]');
        const pageIndex = page ? Number(page.dataset.pageIndex ?? page.dataset.objectPageIndex ?? page.dataset.shortcutPage) : undefined;
        if (objectMenu?.item?.type === item.type && objectMenu.item.id === item.id
            && (event.currentTarget as HTMLElement).hasAttribute('data-open-object-menu')) {
            setObjectMenu(null);
            return;
        }
        const objectItems = handlers.selectedItems || [];
        const isTargetSelected = objectItems.some(selected => selected.type === item.type && selected.id === item.id
            || (item.type === 'menuTitle' || item.type === 'menuSubtitle') && isHeadingSelectionOnPage(selected, headingPageIndex(item.id)));
        if (!isTargetSelected) handlers.handleSelection(item.type, item.id, { backgroundPage: pageIndex });

        setObjectMenuPosition(null);
        setObjectMenu({ x: event.clientX, y: event.clientY, item, pageIndex, anchored: true });
    }, [handlers, objectMenu]);

    (handlers as any).openObjectMenu = openObjectMenu;

    const openBackgroundMenu = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const heading = target?.closest<HTMLElement>('[data-menu-heading]');
        if (heading && isHeadingTextHit(heading, event)) return;
        if (target?.closest([
            '[data-drag-type]',
            '[data-added-image-drag="true"]',
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
        if (!handlers.multiSelectMode) handlers.handleSelection(null, null);
        handlers.setEditingId(null);
        setObjectMenuPosition(null);
        const pasteAt = pastePosition({ x: event.clientX, y: event.clientY });
        const page = target?.closest<HTMLElement>('[data-menu-print-page]');
        setObjectMenu({ x: event.clientX, y: event.clientY, item: null,
            pageIndex: page ? Number(page.dataset.pageIndex) : pasteAt.pageIndex, pasteAt });
    }, [handlers]);

    useEffect(() => {
        if (readOnly) return;
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
    }, [handleDeleteSelectedCanvasItems, readOnly]);

    useEffect(() => {
        if (readOnly) return;
        const handleClipboardShortcuts = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

            const key = event.key.toLowerCase();
            if (!['c', 'x'].includes(key)) return;

            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (document.body.dataset.automenuDeleteContext !== 'canvas') return;

            const selectedObjects = (handlers.selectedItems || []).filter(isObjectItem);
            if (!selectedObjects.length) return;

            event.preventDefault();
            event.stopPropagation();

            if (key === 'c') runObjectAction('copy');
            if (key === 'x') runObjectAction('cut');
        };

        window.addEventListener('keydown', handleClipboardShortcuts);
        return () => window.removeEventListener('keydown', handleClipboardShortcuts);
    }, [handlers.selectedItems, readOnly, runObjectAction]);

    useEffect(() => {
        if (readOnly) return;
        const handleNativePaste = (event: ClipboardEvent) => {
            if (previewRootRef.current?.closest('[inert]')) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select')) return;
            const field = target?.closest<HTMLElement>('[contenteditable="true"]');
            const requested = target?.closest('[data-native-paste]') ? pasteRequest : null;
            if (!requested && (field ? !previewRootRef.current?.contains(field) : document.body.dataset.automenuDeleteContext !== 'canvas')) return;
            const data = event.clipboardData;
            if (!data) return;
            const clip = matchingCanvasCopy(data.getData('text/html'));
            const image = Array.from(data.items).find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
                || Array.from(data.files).find(file => file.type.startsWith('image/'));
            const imageUrl = clipboardImageUrl(data.getData('text/html'));
            let selected: ObjectSelectionItem | null = getActiveObjectItems().slice(-1)[0] ?? null;
            if (requested) selected = requested.target;
            else if (field) {
                const id = field.closest<HTMLElement>('[data-drag-type="product"]')?.dataset.dragId;
                const category = field.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId;
                selected = id ? { type: products.find(p => p.id === id)?.isFreeText ? 'freeText' : 'product', id }
                    : category ? { type: 'category', id: category } : null;
                const first = clip?.items[0];
                if (!selected || (!image && !imageUrl && !(first?.type === 'addedImage' || first?.type === selected.type || (first?.type === 'product' && selected.type === 'category')))) return;
            }
            const text = data.getData('text/plain');
            const payload: NativeClipboardPayload | null = clip ? { type: 'objects', clip } : image ? { type: 'image', blob: image } : imageUrl ? { type: 'imageUrl', url: imageUrl } : text ? { type: 'text', text } : null;
            if (!payload) return;
            event.preventDefault();
            event.stopPropagation();
            const position = requested?.position ?? (selected ? null : lastPastePosition.current) ?? pastePosition(null, selected);
            if (field) field.blur();
            setPasteRequest(null);
            void pastePayload(payload, selected, position);
        };
        window.addEventListener('paste', handleNativePaste, true);
        return () => window.removeEventListener('paste', handleNativePaste, true);
    });

    const restoreProduct = (id: string) => { onToggleProductVisibility?.(id, true); handlers.setShowAddModal(null); };
    const createNewInModal = () => { if (handlers.showAddModal) { onAddProduct?.(handlers.showAddModal.category); handlers.setShowAddModal(null); } };

    const handleBackgroundClick = (e: React.MouseEvent) => {
        setObjectMenu(null);
        const target = e.target as HTMLElement;
        if (target.closest('[data-page-index], button, input, textarea, select, [contenteditable="true"]')) {
            return;
        }

        handlers.handleSelection(null, null);
        handlers.setEditingId(null);
        handlers.setSelectedPageIndex(null);
    };

    const pendingDeletePageIndexes = getPageIndexesForDeletion();
    const isDeletingSelectedPages = pendingDeletePageIndexes.length > 1;
    const isBackgroundMenu = Boolean(objectMenu && !objectMenu.item);
    const contextPageIndex = objectMenu?.pageIndex ?? objectMenu?.pasteAt?.pageIndex ?? 0;
    const headingContext = objectMenu?.item?.type === 'menuTitle' || objectMenu?.item?.type === 'menuSubtitle'
        ? { type: objectMenu.item.type, id: objectMenu.item.id } : null;
    const isHeadingReplicated = headingContext && (menuHeadingFields.some(field => style.headingPages?.[field] === 'all')
        || pages.filter(page => page.mainHeader).length > 1);
    const headingClipboard = useRef<{ plainText: string; fields: Partial<Record<MenuHeadingField, string>> }>(undefined);
    const visibleHeadingFields = menuHeadingFields.filter(field =>
        headingIsOnPage(style, field, contextPageIndex, pages[contextPageIndex]?.headerCopy));
    const copyHeading = () => {
        const fields = Object.fromEntries(visibleHeadingFields.map(field => [field, style[field]]));
        const plainText = visibleHeadingFields.map(field => style[field]).join('\n');
        headingClipboard.current = { fields, plainText };
        void navigator.clipboard?.writeText(plainText).catch(() => {});
        setObjectMenu(null);
    };
    const pasteHeading = async (field: MenuHeadingField) => {
        setObjectMenu(null);
        const copied = headingClipboard.current;
        const text = await navigator.clipboard?.readText().catch(() => '') || copied?.plainText || '';
        if (!text.trim()) return;
        const fields = copied?.plainText === text ? copied.fields : { [field]: text };
        onStyleUpdate?.(previous => {
            const headingPages = { ...previous.headingPages };
            for (const name of menuHeadingFields) {
                if (!fields[name] || headingIsOnPage(previous, name, contextPageIndex, pages[contextPageIndex]?.headerCopy)
                    || headingPages[name] === 'all') continue;
                headingPages[name] = pages.flatMap((page, index) =>
                    index === contextPageIndex || headingIsOnPage(previous, name, index, page.headerCopy) ? [index] : []);
            }
            return reflowPositionsForMenuHeadings(previous, { ...previous, ...fields, headingPages, name: 'Custom' }, pages, measuredHeights);
        });
    };
    const copyHeadingFormatting = (source: { type: MenuHeadingField; id: string }) => {
        if (copyFormatting(source) && formatClipboardRef.current) {
            formatClipboardRef.current.headings = Object.fromEntries(visibleHeadingFields.map(type => [
                type, captureCanvasFormat({ type, id: source.id }, style, products),
            ]));
        }
    };
    const addSubtitle = (pageIndex: number) => {
        const id = headingSelectionId('menuSubtitle', pageIndex);
        const elementId = headingElementId('menuSubtitle', pageIndex);
        flushSync(() => {
            handlers.replaceSelectedItems([{ type: 'menuSubtitle', id }]);
            handlers.startMenuTextEditing('menuSubtitle', elementId, id);
            setObjectMenu(null);
        });
        document.getElementById(elementId)?.focus({ preventScroll: true });
    };
    (handlers as any).commitSubtitleDraft = (pageIndex: number, value: string) => {
        if (!value.trim()) {
            handlers.setFormattingTarget(null);
            return;
        }
        onStyleUpdate?.(previous => {
            const visible = pages.flatMap((page, index) =>
                index === pageIndex || headingIsOnPage(previous, 'menuSubtitle', index, page.headerCopy) ? [index] : []);
            const next: MenuStyle = {
                ...previous, name: 'Custom', menuSubtitle: value,
                headingPages: { ...previous.headingPages, menuSubtitle: previous.headingPages?.menuSubtitle === 'all' ? 'all' : visible },
            };
            return reflowPositionsForMenuHeadings(previous, next, pages, measuredHeights);
        });
    };

    const editHeading = (field: MenuHeadingField, pageIndex: number) => {
        const id = headingSelectionId(field, pageIndex);
        const elementId = headingElementId(field, pageIndex);
        if (!document.getElementById(elementId)) return;
        flushSync(() => {
            const selected = handlers.selectedItems.some(item => isHeadingSelectionOnPage(item, pageIndex));
            if (!selected) handlers.handleSelection(field, id);
            handlers.startMenuTextEditing(field, elementId, id);
            setObjectMenu(null);
        });
        const element = document.getElementById(elementId);
        if (element) {
            element.focus({ preventScroll: true });
            window.getSelection()?.collapse(element, element.childNodes.length);
        }
    };
    const addHeading = (field: MenuHeadingField, pageIndex: number) => {
        onStyleUpdate?.(previous => {
            const visible = pages.flatMap((page, index) =>
                headingIsOnPage(previous, field, index, page.headerCopy) ? [index] : []);
            const next: MenuStyle = {
                ...previous, name: 'Custom', [field]: previous[field]?.trim() ? previous[field] : field === 'menuTitle' ? 'Novo título' : 'Novo subtítulo',
                headingPages: { ...previous.headingPages, [field]: previous.headingPages?.[field] === 'all' ? 'all' : [...new Set([...visible, pageIndex])] },
            };
            return reflowPositionsForMenuHeadings(previous, next, pages, measuredHeights);
        });
        handlers.replaceSelectedItems([{ type: field, id: headingSelectionId(field, pageIndex) }]);
        setObjectMenu(null);
    };
    const updateHeadingPages = (action: 'replicate' | 'keep' | 'remove', activePage = contextPageIndex) => {
        const selected = new Set([activePage, ...handlers.selectedItems.filter(item => item.type === 'menuTitle' || item.type === 'menuSubtitle')
            .map(item => headingPageIndex(item.id))]);
        onStyleUpdate?.(previous => {
            const headingPages = { ...previous.headingPages };
            for (const field of menuHeadingFields) {
                const visible = (index: number) => headingIsOnPage(previous, field, index, pages[index]?.headerCopy);
                if (action === 'replicate') {
                    if (visible(activePage)) headingPages[field] = 'all';
                } else {
                    headingPages[field] = pages.flatMap((_, index) =>
                        visible(index) && selected.has(index) === (action === 'keep') ? [index] : []);
                }
            }
            return reflowPositionsForMenuHeadings(previous, { ...previous, name: 'Custom', headingPages }, pages, measuredHeights);
        });
        if (action === 'remove') handlers.replaceSelectedItems(handlers.selectedItems.filter(item =>
            (item.type !== 'menuTitle' && item.type !== 'menuSubtitle') || !selected.has(headingPageIndex(item.id))));
        setObjectMenu(null);
    };
    (handlers as any).editHeading = editHeading;
    (handlers as any).removeHeading = (pageIndex: number) => updateHeadingPages('remove', pageIndex);
    const hasClipboardFormat = formatClipboardRef.current && objectMenu?.item
        ? acceptsCanvasFormat(formatClipboardRef.current.format, objectMenu.item) : false;
    const contextObjectItem = objectMenu?.item && isObjectItem(objectMenu.item)
        ? objectMenu.item
        : null;
    const contextImage = contextObjectItem?.type === 'addedImage'
        ? style.addedImages?.find((image) => image.id === contextObjectItem.id)
        : undefined;
    const photoTarget = contextObjectItem?.type === 'product' || contextObjectItem?.type === 'category'
        ? { id: contextObjectItem.id, type: contextObjectItem.type } : null;
    const photoVisibility = photoTarget?.type === 'category' ? 'showCategoryImages' : 'showImages';
    const photosEnabled = style[photoVisibility] !== false;
    const hasPhoto = photoTarget?.type === 'category' ? style.categoryImages?.[photoTarget.id]?.url : products.find(p => p.id === photoTarget?.id)?.image;
    const groupHasPhoto = photoTarget && hasPhotosForType(photoTarget.type, style, products);
    const contextFreeTextId = contextObjectItem?.type === 'freeText' ? contextObjectItem.id : null;
    const objectMenuItems = contextObjectItem ? getActiveObjectItems(contextObjectItem) : [];
    const canLayerMenuItems = (direction: 'front' | 'back') => canLayerObjects(style, objectMenuItems, direction);
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
    const applyFontPropagation = () => {
        if (!pendingFontPropagation) return;
        const fontFamily = pendingFontPropagation.fontFamily;
        onStyleUpdate?.((previous) => applyFontToMenuStyle(previous, fontFamily));
        const updates = products
            .filter((product) => product.isFreeText)
            .map((product) => ({ id: product.id, field: 'styles' as keyof Product, value: { ...(product.styles || {}), fontFamily } }));
        if (props.onUpdateProducts) props.onUpdateProducts(updates);
        else updates.forEach((update) => props.onUpdateProduct?.(update.id, update.field, update.value));
        setPendingFontPropagation(null);
    };

    return (
        <div
            ref={previewRootRef}
            data-menu-preview-canvas
            data-canvas-object-dragging={Boolean(handlers.draggedItem || handlers.draggedImageId) || undefined}
            style={{ '--canvas-handle-inverse': Math.min(4, 1 / Math.max(.1, props.scale || 1)) } as React.CSSProperties}
            inert={readOnly ? true : undefined}
            aria-label={readOnly ? 'Pré-visualização do cardápio, somente leitura' : undefined}
            className={`flex justify-start w-full relative ${readOnly ? 'pointer-events-none select-none min-h-0 min-w-0' : 'min-h-full min-w-full md:cursor-grab'}`}
            onClick={readOnly ? undefined : handleBackgroundClick}
            onContextMenu={readOnly ? undefined : openBackgroundMenu}
            onPointerDownCapture={readOnly ? undefined : handlePreviewPointerDownCapture}
            onPointerMove={readOnly ? undefined : handlePreviewPointerMove}
            onPointerUp={readOnly ? undefined : handlePreviewPointerEnd}
            onPointerCancel={readOnly ? undefined : handlePreviewPointerEnd}
            onClickCapture={readOnly ? undefined : (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest('[data-canvas-object-menu="true"]')) return;
                if (suppressBackgroundPressClickRef.current) {
                    suppressBackgroundPressClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                if (suppressMarqueeClickRef.current) {
                    suppressMarqueeClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const paper = target?.closest<HTMLElement>('[data-menu-print-page]') || null;
                const blank = paper && !isCanvasObjectOrControlTarget(target, paper, event);
                const previous = blankPageClicks.current;
                blankPageClicks.current = blank
                    ? { page: paper, consecutive: previous.page === paper && event.detail > 1 ? previous.consecutive + 1 : 1 }
                    : { page: null, consecutive: 0 };
                pasteFormattingOnClick(event);
            }}
            onDoubleClickCapture={readOnly ? undefined : event => {
                const target = event.target;
                const paper = target instanceof Element && target.closest<HTMLElement>('[data-menu-print-page]');
                if (!paper || isCanvasObjectOrControlTarget(target, paper, event)) return;
                const pair = blankPageClicks.current;
                blankPageClicks.current = { page: null, consecutive: 0 };
                if (pair.page !== paper || pair.consecutive < 2) event.stopPropagation();
            }}
        >
            <DynamicFontLoader fonts={usedFonts} />
            {!readOnly && <input ref={productImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleProductImageInput(event)} />}
            {!readOnly && (
                <PricePropagationPrompt
                    request={pendingPricePropagation}
                    style={style}
                    onApply={applyPricePropagation}
                    onDismiss={() => setPendingPricePropagation(null)}
                />
            )}
            {!readOnly && (
                <FontPropagationPrompt
                    request={pendingFontPropagation}
                    onApply={applyFontPropagation}
                    onDismiss={() => setPendingFontPropagation(null)}
                />
            )}

            {readOnly && (
                <div
                    aria-hidden="true"
                    className="absolute inset-0 z-[2147483000] cursor-default pointer-events-auto"
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
                />
            )}

            {!readOnly && marqueeRect && createPortal(
                <div
                    data-marquee-selection="true"
                    className="fixed pointer-events-none border border-indigo-500 bg-indigo-500/15"
                    style={{ ...marqueeRect, zIndex: 2147483000 }}
                />,
                document.body
            )}

            {pasteRequest && createPortal(<div ref={lockModalScrolling} data-native-paste role="dialog" aria-label="Colar da área de transferência" className="fixed inset-0 z-[1000] grid place-items-center bg-slate-900/30 p-4">
                <div className="w-full max-w-xs space-y-3 rounded-xl bg-white p-4 shadow-xl">
                    <p className="text-sm font-semibold">Cole aqui com Ctrl+V, ⌘V ou a opção Colar do celular.</p>
                    <div contentEditable autoFocus ref={node => node?.focus()} role="textbox" aria-label="Colar imagem ou texto" className="min-h-12 rounded-lg border border-indigo-300 bg-indigo-50 p-2" />
                    <div className="flex items-center justify-between gap-2">
                        <button type="button" className="text-sm text-slate-600" onClick={() => setPasteRequest(null)}>Cancelar</button>
                        {lastCanvasCopy() && <button type="button" className="text-sm font-semibold text-indigo-700" onClick={() => {
                            const clip = lastCanvasCopy();
                            if (clip) latestCommit.current(clip, pasteRequest.target, pasteRequest.position);
                            setPasteRequest(null);
                        }}>Usar cópia do editor</button>}
                    </div>
                </div>
            </div>, document.body)}
            {!readOnly && handlers.showAddModal && (createPortal(<div ref={lockModalScrolling} className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => handlers.setShowAddModal(null)}> <div className="bg-white p-4 rounded-xl shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}> <h3 className="text-lg font-bold mb-4">Itens ocultos</h3> <div className="space-y-2 max-h-60 overflow-y-auto"> {products.filter(p => p.category === handlers.showAddModal!.category && !handlers.groupedProducts[handlers.showAddModal!.category]?.find(gp => gp.id === p.id)).map(p => (<button key={p.id} onClick={() => restoreProduct(p.id)} className="w-full p-2 text-left hover:bg-slate-100 rounded flex justify-between items-center"> <span>{p.name}</span> <Plus size={14} /> </button>))} </div> <div className="mt-4 pt-4 border-t"> <button onClick={createNewInModal} className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"> Criar novo item </button> </div> </div> </div>, document.body))}

            <div className={`relative isolate flex ${props.stackPages ? 'flex-col' : 'flex-row'} items-start w-fit mx-auto ${readOnly ? 'gap-4 p-0 min-h-0' : 'gap-8 px-[52px] pb-20 pt-16 min-h-full'}`}>
                {pages.map((pageContent, i) => (
                    visiblePageIndex != null && i !== visiblePageIndex ? null :
                    <MenuPage
                        key={i}
                        pageIndex={i}
                        addedImagePreview={props.addedImagePreview?.pageIndex === i ? props.addedImagePreview : undefined}
                        page={pageContent}
                        style={canvasStyle}
                        handlers={handlers}
                        products={layoutProducts}
                        needsOverlay={!!style.sourceImage}
                        pageCount={pages.length}
                        onAddPage={handleAddPage}
                        onMovePage={handleMovePage}
                        onDeletePage={openPageRemoval}
                        onSetPageNumbersVisible={(visible) => onStyleUpdate?.((previous) => ({
                            ...previous,
                            showPageNumbers: visible,
                            name: 'Custom',
                        }))}
                    />
                ))}
                {!readOnly && <div data-canvas-shortcuts data-print-control="true" className="pointer-events-none absolute inset-0 z-[2]" />}
            </div>

            {!readOnly && promptedImage && createPortal(
                <div
                    ref={backgroundPromptRef}
                    data-background-prompt="true"
                    data-no-browser-selection
                    role="group"
                    aria-label="Integrar ao plano de fundo?"
                    className="fixed z-[10021] w-max max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg"
                    style={backgroundPromptPosition ?? { visibility: 'hidden' }}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <p className="px-1 font-medium">Integrar ao plano de fundo?</p>
                    <div className="mt-1 flex justify-end gap-1">
                        <button type="button" className="rounded px-2 py-1 hover:bg-slate-100" onClick={dismissBackgroundPrompt}>Não</button>
                        <button type="button" className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700"
                            onClick={() => setImageBackground(promptedImage.id)}>Sim</button>
                    </div>
                </div>,
                document.body
            )}

            {!readOnly && croppingImage && <CanvasImageCropDialog key={croppingImage.id} image={croppingImage}
                onClose={() => setImageCropId(null)} onApply={applyImageCrop} />}
            {!readOnly && objectMenu && createPortal(
                <div
                    ref={objectMenuRef}
                    data-canvas-object-menu="true"
                    className="fixed z-[10000] min-w-52 max-h-[calc(100vh-16px)] select-none overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl text-sm text-slate-700"
                    style={{ left: menuLeft, top: menuTop, maxHeight: objectMenuPosition?.maxHeight, WebkitUserSelect: 'none', userSelect: 'none' }}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    {isBackgroundMenu ? (
                    <>
                        <button type="button" aria-pressed={handlers.multiSelectMode} onClick={() => {
                            handlers.setMultiSelectMode(!handlers.multiSelectMode);
                            setObjectMenu(null);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700">
                            <CopyCheck size={15} /> Seleção múltipla
                        </button>
                        <button type="button" onClick={() => duplicatePage(contextPageIndex)} disabled={!props.onPasteObjects}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">
                            <CopyPlus size={15} /> Duplicar
                        </button>
                        <button type="button" onClick={() => runObjectAction('paste')}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Clipboard size={15} /> Colar
                        </button>
                        <button type="button" disabled={headingIsOnPage(style, 'menuTitle', contextPageIndex, pages[contextPageIndex]?.headerCopy)}
                            onClick={() => addHeading('menuTitle', contextPageIndex)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">
                            <Plus size={15} /> Adicionar título
                        </button>
                        {style.menuBackgroundPhoto ? (
                            <button type="button" onClick={() => {
                                if (props.onRemoveBackgroundPhoto) props.onRemoveBackgroundPhoto();
                                else onStyleUpdate?.(previous => ({ ...previous, menuBackgroundPhoto: undefined, name: 'Custom' }));
                                setObjectMenu(null);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                                <Trash2 size={15} /> Remover imagem de fundo
                            </button>
                        ) : props.onChooseBackgroundImage && (
                            <button type="button" disabled={props.isAddingImage} onClick={() => {
                                props.onChooseBackgroundImage?.();
                                setObjectMenu(null);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">
                                <Wallpaper size={15} /> Definir imagem de fundo
                            </button>
                        )}
                        <button type="button" onClick={() => openPageRemoval(contextPageIndex)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                            <Trash2 size={15} /> Remover página
                        </button>
                    </>
                    ) : headingContext ? (
                        <>
                        <button type="button" onClick={() => editHeading(headingContext.type, contextPageIndex)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Edit3 size={15} /> {headingContext.type === 'menuTitle' ? 'Editar título' : 'Editar subtítulo'}
                        </button>
                        <button type="button" aria-pressed={handlers.multiSelectMode} onClick={() => {
                            handlers.setMultiSelectMode(!handlers.multiSelectMode);
                            setObjectMenu(null);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 aria-pressed:bg-indigo-50">
                            <CopyCheck size={15} /> Seleção múltipla
                        </button>
                        <button type="button" onClick={copyHeading} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Copy size={15} /> Copiar
                        </button>
                        <button type="button" onClick={() => copyHeadingFormatting(headingContext)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Paintbrush size={15} /> Copiar formatação
                        </button>
                        <button type="button" onClick={() => void pasteHeading(headingContext.type)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Clipboard size={15} /> Colar
                        </button>
                        <button type="button" disabled={!hasClipboardFormat} onClick={() => pasteFormattingClipboard([headingContext])}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Paintbrush size={15} /> Colar formatação
                        </button>
                        <button type="button" onClick={() => updateHeadingPages(isHeadingReplicated ? 'keep' : 'replicate')}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <CopyPlus size={15} /> {isHeadingReplicated ? 'Usar só nesta página' : 'Replicar para outras páginas'}
                        </button>
                        {headingContext.type === 'menuTitle' && !headingIsOnPage(style, 'menuSubtitle', contextPageIndex, pages[contextPageIndex]?.headerCopy) && (
                            <button type="button" onClick={() => addSubtitle(contextPageIndex)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                                <Plus size={15} /> Adicionar subtítulo
                            </button>
                        )}
                        <button type="button" onClick={() => updateHeadingPages('remove')}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                            <Trash2 size={15} /> Remover
                        </button>
                        </>
                    ) : (
                    <>
                    {contextObjectItem && contextObjectItem.type !== 'addedImage' && (
                        <button type="button" onClick={(event) => {
                            const { type, id } = contextObjectItem;
                            setObjectMenu(null);
                            handlers.startEditing(event, id, type === 'category' ? `text-${id}` : `product-name-${id}`);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Edit3 size={15} /> {contextObjectItem.type === 'category' ? 'Editar categoria' : contextFreeTextId ? 'Editar texto' : 'Editar produto'}
                        </button>
                    )}
                    <button type="button" aria-pressed={handlers.multiSelectMode} onClick={() => { handlers.setMultiSelectMode?.(!handlers.multiSelectMode); setObjectMenu(null); }} className={`w-full px-3 py-2 text-left flex items-center gap-2 ${handlers.multiSelectMode ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}><CopyCheck size={15} /> Seleção múltipla</button>
                    {contextImage?.shape && <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => { handlers.startImageEditing(contextImage.id); setObjectMenu(null); }}><Edit3 size={15} /> Editar forma</button>}
                    {photoTarget && <>
                        {(!hasPhoto || photosEnabled) && <button type="button" onClick={event => {
                            handlers.startEditing(event, photoTarget.id, photoTarget.type === 'category' ? `text-${photoTarget.id}` : `product-name-${photoTarget.id}`);
                            handlers.setFormattingTarget(null);
                            choosePhoto(photoTarget.type, photoTarget.id);
                            setObjectMenu(null);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Images size={15} /> {hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'}
                        </button>}
                        {groupHasPhoto && <button type="button" onClick={() => {
                            onStyleUpdate?.(prev => ({ ...prev, [photoVisibility]: !photosEnabled, name: 'Custom' }));
                            setObjectMenu(null);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Images size={15} /> {photosEnabled ? 'Desabilitar imagens' : 'Habilitar imagens'}
                        </button>}
                    </>}
                    {(contextImage || contextFreeTextId) && (
                        <button type="button" onClick={() => {
                            if (contextImage) setImageBackground(contextImage.id, objectMenu.pageIndex);
                            else if (contextFreeTextId) toggleFreeTextBackground(contextFreeTextId);
                        }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <Layers size={15} /> {contextImage?.repeatAsBackground ? 'Usar só nesta página'
                                : contextFreeTextId && style.freeTextBackgrounds?.[contextFreeTextId] ? 'Remover do plano de fundo'
                                    : 'Integrar ao plano de fundo'}
                        </button>
                    )}
                    {contextImage && (
                        <>
                            {!contextImage.shape && <button type="button" onClick={() => {
                                if (props.onMovePhotoToBackground) props.onMovePhotoToBackground(contextImage.id);
                                else onStyleUpdate?.(previous => moveImageToMenuBackground(previous, contextImage.id));
                                handlers.handleSelection(null, null);
                                setObjectMenu(null);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                                <Wallpaper size={15} /> Definir imagem de fundo
                            </button>}
                            {!contextImage.shape && <button type="button" onClick={() => openImageCrop(contextImage.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><Crop size={15} /> Cortar</button>}
                            <button type="button" onClick={() => flipImage(contextImage.id, 'flipHorizontal')}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><FlipHorizontal2 size={15} /> Inverter horizontalmente</button>
                            <button type="button" onClick={() => flipImage(contextImage.id, 'flipVertical')}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><FlipVertical2 size={15} /> Inverter verticalmente</button>
                        </>
                    )}
                    <button onClick={() => runObjectAction('copy', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Copy size={15} /> Copiar</button>
                    <button onClick={() => runObjectAction('copyFormat', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Paintbrush size={15} /> Copiar formatação</button>
                    <button
                        onClick={() => runObjectAction('paste', contextObjectItem)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Clipboard size={15} /> Colar
                    </button>
                    <button
                        onClick={() => runObjectAction('pasteFormat', contextObjectItem)}
                        disabled={!hasClipboardFormat}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Paintbrush size={15} /> Colar formatação
                    </button>
                    <button onClick={() => runObjectAction('cut', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Scissors size={15} /> Recortar</button>
                    <button onClick={() => runObjectAction('duplicate', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><CopyPlus size={15} /> Duplicar</button>
                    {canHideFromObjectMenu && (
                        <button onClick={() => runObjectAction('hide', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><EyeOff size={15} /> Ocultar</button>
                    )}
                    <div className="my-1 h-px bg-slate-100" />
                    <button disabled={!canLayerMenuItems('front')} onClick={() => runObjectAction('front', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><BringToFront size={15} /> Trazer para frente</button>
                    <button disabled={!canLayerMenuItems('back')} onClick={() => runObjectAction('back', contextObjectItem)} className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><SendToBack size={15} /> Enviar para trás</button>
                    {contextObjectItem && (
                        <button type="button" onClick={(event) => {
                            if (contextImage) {
                                handlers.handleRemoveImage(event, contextImage.id);
                                setObjectMenu(null);
                            } else runObjectAction('delete', contextObjectItem);
                        }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                            <Trash2 size={15} /> {contextImage ? contextImage.shape ? 'Remover forma' : 'Remover imagem' : 'Remover'}
                        </button>
                    )}
                    </>
                    )}
                </div>,
                document.body
            )}

            {handlers.showDeletePageConfirm && createPortal(
                <div ref={lockModalScrolling} className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
