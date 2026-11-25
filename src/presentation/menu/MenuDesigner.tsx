import type { CanvasFileExports } from './designer/useCanvasFileExports';
import { formattingLabels, getFormattingGroups, getFormattingItems, getItemFormattingStyle, setElementFormatting, standardizeItemFormatting, updateItemFormatting, type FormattingKind, type FormattingScope } from '../../domain/menu/itemFormatting';
import { MenuFontContext } from './designer/SearchableSelects';
import { hasMenuContentMutation } from './canvas/menuContentMutations';
import { applyContrastTip, scanBackgroundTextOverlap, scanTextContrast, type ContrastTip, type OverlapTip } from './canvas/canvasTextTips';
import { categoryName } from '../../domain/menu/categoryName';
import { applyTemplateToCurrentStyle } from '../../application/templates/templateApplication';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Product, MenuStyle, SortOption, ElementStyle, AddedImage, CanvasShape } from '../../domain/menu/model';
import { MenuPreview } from './canvas/MenuPreview';
import { Undo, Redo, AlertCircle, Check, X } from 'lucide-react';
import { ZoomControls } from './designer/ZoomControls';
import { MenuSidebar } from './designer/MenuSidebar';
import type { PrintCanvasOptions } from './designer/PrintCanvasModal';
import type { VirtualLinkControls } from '../publishing/VirtualLinkSection';
import type { SplitCategorySwap } from '../../domain/menu/splitCategorySwap';
import { useAppServices } from '../app/AppServicesProvider';
import { useCanvasPrinting } from './designer/useCanvasPrinting';
import type { MoveDirection, SelectionItem } from './interactions/types';
import { CustomMarkerLibraryProvider } from './designer/CustomMarkerLibrary';
import { canvasShapeUrl, getCanvasShapeDimensions } from '../../domain/menu/canvasShapes';
import { bindCanvasZoomGestures, getZoomAnchor, restoreZoomAnchor, type CanvasPoint, centerCanvasProduct, getCanvasProduct, getCanvasProductBounds, getCanvasViewportBounds, getCanvasViewportFocus, positionCanvasImage } from './canvas/canvasViewport';
import { MenuColorContext, getMenuPalette } from './designer/ColorPicker';
import { getImageLayerIndexes, moveImageToMenuBackground } from '../../domain/menu/imageLayers';
import {
    canIncreaseCanvasFontSize,
    getLargestSafeFontSizeForElements,
    type WordFitScope,
} from './canvas/textFit';
import { roundPrice } from '../../domain/menu/price';
import { restoreGeneralRules, useRestoreTemplateSettings } from './designer/useRestoreTemplateSettings';
import { resolveMenuPageDimensions } from '../../domain/menu/pageSetup';
import { optimizeImageForUpload, preloadImage } from '../../infrastructure/browser/imageUpload';
import { FontPropagationPrompt, type FontPropagationRequest } from './FontPropagationPrompt';
import { applyFontToFreeTexts, applyFontToMenuStyle, getConfiguredCanvasFonts } from '../../domain/menu/fontPropagation';

const PrintCanvasModal = React.lazy(() => import('./designer/PrintCanvasModal').then((module) => ({
    default: module.PrintCanvasModal,
})));

interface MenuDesignerProps {
    virtualLinkControls?: VirtualLinkControls;
    fileExportRef?: React.Ref<CanvasFileExports>;
    onExportablePagesChange?: (pageCount: number) => void;
    onSelectedPagesChange?: (indexes: number[]) => void;
    products: Product[];
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
    setProductsAndStyle?: (products: Product[], style: MenuStyle, actionLabel?: string) => void;
    templates?: MenuStyle[];
    sortOption: SortOption;
    setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
    undo?: () => void;
    redo?: () => void;
    onProductEditChange?: (id: string | null) => void;
    canUndo?: boolean;
    canRedo?: boolean;
    isOpen?: boolean;
    isProductDesignerOpen?: boolean;
    onRulesLayoutEditingChange?: (editing: boolean) => void;
    printRequestId?: number;
    onPrintDownloadChange?: (active: boolean) => void;
    silentPrintOptions?: Partial<PrintCanvasOptions>;
    onClose?: () => void;
    onOpenVisual?: () => void;
    onCanvasScroll?: () => void;
    workspaceId: string;
    currentUserId: string;
    currentMenuId?: string;
    onSaveTemplate?: (name: string, description: string, id: string, publish: boolean) => Promise<void>;
    onPublishTemplate?: (id: string) => Promise<void>;
    splitCategoryAcrossPages?: boolean;
    productsCanChangeCategory?: boolean;
}

const DEFAULT_PREVIEW_ZOOM = 1;
const MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER = 0.36;
const DESKTOP_PREVIEW_ZOOM_RENDER_MULTIPLIER = MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER * 1.7;

type AddedImageFeedback =
    | { phase: 'loading'; previewUrl: string; focus: ReturnType<typeof getCanvasViewportFocus>; aspect: number }
    | { phase: 'error'; filename: string };

interface FontTip {
    scope: WordFitScope;
    count: number;
    safeFontSize: number;
}

interface LayoutDiagnostics {
    overlappingCategoryIds: string[];
    overlappingProductIds: string[];
    overlappingFreeTextIds: string[];
    offCanvasCategoryIds: string[];
    offCanvasProductIds: string[];
    offCanvasFreeTextIds: string[];
    hasColumnGap: boolean;
}

interface LayoutElementEntry {
    element: HTMLElement;
    id: string;
    type: 'category' | 'product' | 'freeText';
    rect: DOMRect;
}

const EMPTY_LAYOUT_DIAGNOSTICS: LayoutDiagnostics = {
    overlappingCategoryIds: [],
    overlappingProductIds: [],
    overlappingFreeTextIds: [],
    offCanvasCategoryIds: [],
    offCanvasProductIds: [],
    offCanvasFreeTextIds: [],
    hasColumnGap: false,
};

interface RenderedMoveEntry {
    id: string;
    pageIndex: number;
    columnIndex: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
}

const insertItemAtOriginalIndex = (order: string[], itemId: string, insertionIndex: number) => {
    const nextOrder = order.filter((id) => id !== itemId);
    nextOrder.splice(Math.max(0, Math.min(insertionIndex, nextOrder.length)), 0, itemId);
    return nextOrder;
};

const WORD_FIT_SCOPE_LABELS: Record<WordFitScope, string> = {
    menuTitle: 'títulos principais',
    menuSubtitle: 'subtítulos',
    category: 'categorias',
    productName: 'nomes dos produtos',
    productPrice: 'preços',
    productDescription: 'descrições dos produtos',
    freeText: 'textos livres',
};

const formatLayoutIssueBreakdown = (categories: number, products: number, freeTexts: number) => {
    const parts = [
        categories > 0 ? `${categories} ${categories === 1 ? 'categoria' : 'categorias'}` : null,
        products > 0 ? `${products} ${products === 1 ? 'produto' : 'produtos'}` : null,
        freeTexts > 0 ? `${freeTexts} ${freeTexts === 1 ? 'texto livre' : 'textos livres'}` : null,
    ].filter(Boolean) as string[];
    if (parts.length <= 1) return parts[0] || '';
    return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
};

const MenuDesigner: React.FC<MenuDesignerProps> = ({ products, style, setStyle, setProducts, setProductsAndStyle, templates = [], sortOption, setSortOption, undo, redo, onProductEditChange, canUndo, canRedo, isOpen = true, isProductDesignerOpen = false, onRulesLayoutEditingChange, printRequestId = 0, onPrintDownloadChange, silentPrintOptions, virtualLinkControls, fileExportRef, onExportablePagesChange, onSelectedPagesChange, onClose, onOpenVisual, onCanvasScroll, workspaceId, currentUserId, currentMenuId, onSaveTemplate, onPublishTemplate, splitCategoryAcrossPages: legacySplit = false, productsCanChangeCategory: legacyDrag = false }) => {
    const { assets: { uploadFileAsset } } = useAppServices();
    const restoreTemplateSettings = useRestoreTemplateSettings(style, setStyle, templates, workspaceId);
    const splitCategoryAcrossPages = style.splitCategoryAcrossPages ?? legacySplit;
    const productsCanChangeCategory = style.productsCanChangeCategory ?? legacyDrag;
    const [scale, setScale] = useState(DEFAULT_PREVIEW_ZOOM);
    const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.matchMedia('(min-width: 768px)').matches);
    const zoomMultiplier = isDesktopViewport ? DESKTOP_PREVIEW_ZOOM_RENDER_MULTIPLIER : MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER;
    const renderScale = scale * zoomMultiplier;
    const [shapePickerRequest, setShapePickerRequest] = useState<{ id: string } | null>(null);
    const openShapePicker = (id: string) => {
        onOpenVisual?.();
        setShapePickerRequest({ id });
    };
    const [tipsOpen, setTipsOpen] = useState(false);
    const [contrastTips, setContrastTips] = useState<ContrastTip[]>([]);
    const [backgroundOverlapTips, setBackgroundOverlapTips] = useState<OverlapTip[]>([]);
    const [splitCategorySwap, setSplitCategorySwap] = useState<SplitCategorySwap | null>(null);
    const [fontTips, setFontTips] = useState<FontTip[]>([]);
    const [pendingFontPropagation, setPendingFontPropagation] = useState<FontPropagationRequest | null>(null);
    const [addedImageFeedback, setAddedImageFeedback] = useState<AddedImageFeedback | null>(null);
    const pendingImagePreview = useRef<string | null>(null);
    const pendingImage = addedImageFeedback?.phase === 'loading' ? addedImageFeedback : null;
    const isAddingImage = pendingImage !== null;
    const updateImagePreviewAspect = useCallback((aspect: number) => {
        setAddedImageFeedback(current => current?.phase === 'loading' && current.aspect !== aspect ? { ...current, aspect } : current);
    }, []);
    const imagePreview = React.useMemo(() => pendingImage ? {
        url: pendingImage.previewUrl,
        ...positionCanvasImage(pendingImage.focus, resolveMenuPageDimensions(style), 300, pendingImage.aspect),
        aspect: pendingImage.aspect,
        onAspect: updateImagePreviewAspect,
    } : undefined, [pendingImage, style, updateImagePreviewAspect]);
    React.useLayoutEffect(() => {
        setAddedImageFeedback(null);
        return () => {
            if (pendingImagePreview.current) URL.revokeObjectURL(pendingImagePreview.current);
            pendingImagePreview.current = null;
        };
    }, [currentMenuId, workspaceId, currentUserId]);
    const [layoutDiagnostics, setLayoutDiagnostics] = useState<LayoutDiagnostics>(EMPTY_LAYOUT_DIAGNOSTICS);
    const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
    const [hoveredFontScope, setHoveredFontScope] = useState<WordFitScope | null>(null);
    const zoomIndicatorRef = useRef<HTMLDivElement>(null);
    const zoomFrameRequest = useRef(0);
    const pendingZoom = useRef<{ scale: number; point: CanvasPoint; anchor: CanvasPoint } | null>(null);
    const zoomActivityTimer = useRef<number | undefined>(undefined);
    const zoomInputs = useRef({ pinch: false, buttons: false });
    const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const canvasScrollPosition = useRef({ left: 0, top: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const tipsAnchorRef = useRef<HTMLDivElement>(null);
    const tipsPanelRef = useRef<HTMLDivElement>(null);
    const canvasPanRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        scrollLeft: number;
        scrollTop: number;
        isPanning: boolean;
    } | null>(null);
    const suppressNextCanvasClickRef = useRef(false);
    const knownProductIdsRef = useRef(new Set(products.map(product => product.id)));
    const productEditViewRef = useRef<{ scale: number; scrollLeft: number; scrollTop: number } | null>(null);
    const editingProductRef = useRef<string | null>(null);
    const pendingCanvasFocus = useRef<{ scale: number; apply: () => void } | null>(null);
    const borderFocusFrame = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!tipsOpen) return;
        const closeTipsOutside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && (tipsAnchorRef.current?.contains(target) || tipsPanelRef.current?.contains(target))) return;
            setTipsOpen(false);
            setHoveredFontScope(null);
        };
        document.addEventListener('pointerdown', closeTipsOutside, true);
        return () => document.removeEventListener('pointerdown', closeTipsOutside, true);
    }, [tipsOpen]);

    React.useLayoutEffect(() => {
        if (!tipsOpen) return;
        const anchor = tipsAnchorRef.current;
        const panel = tipsPanelRef.current;
        if (!anchor || !panel) return;
        const update = () => {
            const bounds = anchor.getBoundingClientRect();
            panel.style.left = `${bounds.left}px`;
            panel.style.top = `${bounds.bottom + 8}px`;
        };
        update();
        const observer = new ResizeObserver(update);
        if (containerRef.current) observer.observe(containerRef.current);
        window.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [tipsOpen]);

    // State for selection context (What element is user clicking?)
    const [selection, setSelection] = useState<{ type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null, formattingScope?: FormattingScope }>({ type: null, id: null });
    const [selectedAddedImageIds, setSelectedAddedImageIds] = useState<string[]>([]);
    const [selectedFormattingItems, setSelectedFormattingItems] = useState<SelectionItem[]>([]);
    const [standardization, setStandardization] = useState<Partial<Record<FormattingKind, string>>>({});
    const changeSelection = useCallback((next: typeof selection, extendSelection = false) => {
        setSelection(previous => {
            if (previous.type === next.type && previous.id === next.id) return previous;
            return extendSelection && next.id !== null && previous.formattingScope === 'selection'
                ? { ...next, formattingScope: 'selection' }
                : next;
        });
    }, []);
    const [selectedPrintPages, setSelectedPrintPages] = useState<number[]>([]);
    const handleCanvasSelectedItems = useCallback((items: SelectionItem[]) => {
        const pages = items.filter(item => item.type === 'page').map(item => Number(item.id));
        setSelectedPrintPages(previous => previous.length === pages.length && previous.every((index, i) => index === pages[i])
            ? previous : pages);
        onSelectedPagesChange?.(pages);
        const targeted = items.filter(item => item.type === 'category' || item.type === 'product');
        setSelectedFormattingItems(previous => previous.length === targeted.length
            && previous.every((item, index) => item.type === targeted[index].type && item.id === targeted[index].id)
            ? previous : targeted);
        const ids = items.filter(item => item.type === 'addedImage').map(item => item.id);
        setSelectedAddedImageIds(previous => previous.length === ids.length && previous.every((id, index) => id === ids[index])
            ? previous
            : ids);
    }, [onSelectedPagesChange]);
    // State to trigger imperative actions in Preview from Sidebar
    const [previewAction, setPreviewAction] = useState<{ type: string, id: number } | undefined>(undefined);

    const canvasZoomRef = useRef<HTMLDivElement>(null);
    const zoomLayerRef = useRef<HTMLDivElement>(null);
    const zoomFrameRef = useRef<HTMLDivElement>(null);
    const scaleRef = useRef(scale);
    React.useLayoutEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    const displayProducts = products;
    const formattingItems = React.useMemo(() => getFormattingItems(products), [products]);
    const formattingGroups = React.useMemo(() => ({
        category: getFormattingGroups(style, 'category', formattingItems.category),
        product: getFormattingGroups(style, 'product', formattingItems.product),
    }), [style.itemFormattingOverrides, style.categoryDividerStyles, style.productDividerStyles,
        style.elementStyles, style.categoryDividerStyle, style.productDividerStyle, style.borders, style.fills, style.markers,
        style.cardBackgroundColor, style.cardBackgroundColorOverride, style.design, style.fontFamily, style.primaryColor, style.textColor, formattingItems]);
    const formattingKind = selection.type === 'category' || selection.type === 'product' ? selection.type : null;
    const activeGroups = formattingKind ? formattingGroups[formattingKind] : [];
    const activeGroup = activeGroups.findIndex(group => group.includes(selection.id ?? ''));
    const defaultScope: FormattingScope = activeGroups.length > 1 && activeGroup >= 0 ? 'group' : 'all';
    const activeScope = selection.formattingScope === 'group' ? defaultScope : selection.formattingScope ?? defaultScope;
    const itemStyle = (kind: FormattingKind) => {
        const id = kind === formattingKind ? selection.id : formattingGroups[kind][0]?.[0];
        return id ? getItemFormattingStyle(style, kind, id) : style;
    };
    const updateScopedFormatting = (kind: FormattingKind, id: string, recipe: (value: MenuStyle) => MenuStyle) => {
        const isActive = kind === formattingKind && selection.id === id;
        const scope = isActive ? activeScope : kind === formattingKind && formattingGroups[kind].length > 1 ? 'group' : 'all';
        const selectedIds = selectedFormattingItems.filter(item => item.type === kind).map(item => item.id);
        setStyle(previous => updateItemFormatting(previous, kind, id, formattingItems[kind], scope,
            selectedIds.includes(id) ? selectedIds : [id], recipe));
    };
    const setSidebarFormatting = (kind: FormattingKind, update: React.SetStateAction<MenuStyle>) => {
        const id = kind === formattingKind ? selection.id : formattingGroups[kind][0]?.[0];
        if (!id) return setStyle(update);
        updateScopedFormatting(kind, id, previous => typeof update === 'function' ? update(previous) : update);
    };
    const kindsWithDifferences = (['category', 'product'] as const).filter(kind => formattingGroups[kind].length > 1);
    const standardizationSource = (kind: FormattingKind) => {
        const representatives = formattingGroups[kind].map(group => group[0]);
        return representatives.find(id => id === standardization[kind]) ?? representatives[0];
    };
    const realCategoryIds = new Set(formattingItems.category);
    const positionedCategoryIds = Object.keys(style.categoryPositions || {}).filter(category => realCategoryIds.has(category));
    const positionedCategorySignature = positionedCategoryIds.slice().sort().join('\u0000');
    const visibleFontTips = fontTips.filter(tip => !dismissedTips.has(`font:${tip.scope}`));
    const overlapIssueCount = layoutDiagnostics.overlappingCategoryIds.length
        + layoutDiagnostics.overlappingProductIds.length
        + layoutDiagnostics.overlappingFreeTextIds.length;
    const offCanvasIssueCount = layoutDiagnostics.offCanvasCategoryIds.length
        + layoutDiagnostics.offCanvasProductIds.length
        + layoutDiagnostics.offCanvasFreeTextIds.length;
    const showOverlapTip = overlapIssueCount > 0 && !dismissedTips.has('overlapping-elements');
    const showOffCanvasTip = offCanvasIssueCount > 0 && !dismissedTips.has('off-canvas-elements');
    const showPositionedCategoryTip = (positionedCategoryIds.length > 0 || layoutDiagnostics.hasColumnGap)
        && !dismissedTips.has('free-categories');
    const splitCategoryTipKey = splitCategorySwap ? `split-category:${splitCategorySwap.category}` : null;
    const visibleSplitCategorySwap = splitCategoryTipKey && !dismissedTips.has(splitCategoryTipKey) ? splitCategorySwap : null;
    const configuredCanvasFonts = React.useMemo(() => getConfiguredCanvasFonts(style, products), [style, products]);
    const showMixedFontTip = configuredCanvasFonts.length > 1 && !dismissedTips.has('mixed-fonts');
    const hasVisibleTips = visibleFontTips.length > 0 || showMixedFontTip || showOverlapTip || showOffCanvasTip
        || showPositionedCategoryTip || Boolean(visibleSplitCategorySwap) || contrastTips.length > 0 || backgroundOverlapTips.length > 0 || kindsWithDifferences.length > 0;

    useEffect(() => {
        const root = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas]');
        if (!root) return;
        let timer: number | undefined;
        let detection: AbortController | undefined;
        const schedule = () => {
            window.clearTimeout(timer);
            detection?.abort();
            timer = window.setTimeout(() => {
                const run = new AbortController();
                detection = run;
                setBackgroundOverlapTips(scanBackgroundTextOverlap(root, style));
                void scanTextContrast(root, style, run.signal).then(tips => {
                    if (!run.signal.aborted) setContrastTips(tips);
                }).catch(() => undefined);
            }, 400);
        };
        const observer = new ResizeObserver(schedule);
        const zoomLayer = root.querySelector('[data-canvas-zoom-layer]');
        if (zoomLayer) observer.observe(zoomLayer);
        const onImageLoad = (event: Event) => {
            if (event.target instanceof Element && !event.target.closest('[data-print-control]')) schedule();
        };
        root.addEventListener('load', onImageLoad, true);
        document.fonts?.addEventListener('loadingdone', schedule);
        schedule();
        return () => {
            observer.disconnect();
            root.removeEventListener('load', onImageLoad, true);
            document.fonts?.removeEventListener('loadingdone', schedule);
            window.clearTimeout(timer);
            detection?.abort();
        };
    }, [products, style, isOpen]);


    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const syncViewport = () => setIsDesktopViewport(mediaQuery.matches);
        syncViewport();
        mediaQuery.addEventListener('change', syncViewport);
        return () => mediaQuery.removeEventListener('change', syncViewport);
    }, []);

    useEffect(() => {
        const previousIds = knownProductIdsRef.current;
        const hasNewProduct = products.some(product => !product.isFreeText && !previousIds.has(product.id));
        knownProductIdsRef.current = new Set(products.map(product => product.id));
        if (!hasNewProduct || (style.categoryColumnCount || 1) <= 1) return;

        setStyle(current => {
            const positionedCategories = new Set(Object.keys(current.categoryPositions || {}));
            const currentPlacements = Object.entries(current.categoryPlacements || {});
            const nextPlacements = Object.fromEntries(
                currentPlacements.filter(([category]) => positionedCategories.has(category))
            );
            if (Object.keys(nextPlacements).length === currentPlacements.length) return current;
            return { ...current, categoryPlacements: nextPlacements, name: 'Custom' };
        });
    }, [products, setStyle, style.categoryColumnCount]);

    useEffect(() => {
        const root = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!root) return;

        let frameId: number | null = null;
        const scanFontTips = () => {
            frameId = null;
            const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit="true"]'))
                .filter(element => element.isConnected && element.getClientRects().length > 0);
            const eligibleElements = elements.filter(element => element.dataset.wordOverflow !== 'true');
            const reducedElements = eligibleElements.filter(element => element.dataset.wordFitReduced === 'true');
            const scopes = Array.from(new Set(
                reducedElements
                    .map(element => element.dataset.wordFitScope as WordFitScope | undefined)
                    .filter((scope): scope is WordFitScope => Boolean(scope && WORD_FIT_SCOPE_LABELS[scope]))
            ));
            const nextTips = scopes.map(scope => {
                const scopeElements = eligibleElements.filter(element => element.dataset.wordFitScope === scope);
                const maximumFontSize = Math.max(
                    ...scopeElements.map(element => Number(element.dataset.wordFitBaseSize) || 10),
                );
                const minimumFontSize = Math.max(
                    ...scopeElements.map(element => Number(element.dataset.wordFitMinimum) || 10),
                );
                return {
                    scope,
                    count: reducedElements.filter(element => element.dataset.wordFitScope === scope).length,
                    safeFontSize: getLargestSafeFontSizeForElements(scopeElements, maximumFontSize, minimumFontSize),
                };
            });

            setFontTips(current => {
                const unchanged = current.length === nextTips.length && current.every((tip, index) => (
                    tip.scope === nextTips[index]?.scope
                    && tip.count === nextTips[index]?.count
                    && tip.safeFontSize === nextTips[index]?.safeFontSize
                ));
                return unchanged ? current : nextTips;
            });
        };
        const scheduleScan = () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(scanFontTips);
        };
        const observer = new MutationObserver(records => { if (hasMenuContentMutation(records)) scheduleScan(); });
        observer.observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-word-fit-reduced', 'data-word-fit-size', 'data-word-fit-base-size', 'data-word-overflow'],
        });
        scheduleScan();

        return () => {
            observer.disconnect();
            if (frameId !== null) window.cancelAnimationFrame(frameId);
        };
    }, [products, style]);

    useEffect(() => {
        const root = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!root) return;

        let frameId: number | null = null;
        let settleFrameId: number | null = null;
        const productById = new Map(products.map(product => [product.id, product]));
        const realCategories = new Set(products.filter(product => !product.isFreeText).map(product => product.category));

        const scanLayout = () => {
            const overlappingCategories = new Set<string>();
            const overlappingProducts = new Set<string>();
            const overlappingFreeTexts = new Set<string>();
            const offCanvasCategories = new Set<string>();
            const offCanvasProducts = new Set<string>();
            const offCanvasFreeTexts = new Set<string>();
            let hasColumnGap = false;

            const addIssue = (
                entry: { type: 'category' | 'product' | 'freeText'; id: string },
                categorySet: Set<string>,
                productSet: Set<string>,
                freeTextSet: Set<string>,
            ) => {
                if (entry.type === 'category') categorySet.add(entry.id);
                else if (entry.type === 'freeText') freeTextSet.add(entry.id);
                else productSet.add(entry.id);
            };

            root.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').forEach(page => {
                const pageRect = page.getBoundingClientRect();
                const pageScale = pageRect.width / page.offsetWidth || 1;
                const tolerance = 3 * pageScale;
                const entries = Array.from(page.querySelectorAll<HTMLElement>(
                    '[data-drag-type="category"][data-drag-id], [data-drag-type="product"][data-drag-id]'
                )).reduce<LayoutElementEntry[]>((result, element) => {
                    if (!element.isConnected || element.getClientRects().length === 0) return result;
                    const id = element.dataset.dragId;
                    const dragType = element.dataset.dragType;
                    if (!id) return result;
                    if (dragType === 'category') {
                        if (realCategories.has(id)) {
                            result.push({ element, id, type: 'category', rect: element.getBoundingClientRect() });
                        }
                        return result;
                    }
                    const product = productById.get(id);
                    if (product) {
                        result.push({
                            element,
                            id,
                            type: product.isFreeText ? 'freeText' : 'product',
                            rect: element.getBoundingClientRect(),
                        });
                    }
                    return result;
                }, []);

                entries.forEach(entry => {
                    if (
                        entry.rect.left < pageRect.left - tolerance
                        || entry.rect.right > pageRect.right + tolerance
                        || entry.rect.top < pageRect.top - tolerance
                        || entry.rect.bottom > pageRect.bottom + tolerance
                    ) {
                        addIssue(entry, offCanvasCategories, offCanvasProducts, offCanvasFreeTexts);
                    }
                });

                for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
                    const first = entries[firstIndex];
                    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
                        const second = entries[secondIndex];
                        if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
                        const overlapWidth = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
                        const overlapHeight = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
                        if (overlapWidth <= tolerance || overlapHeight <= tolerance) continue;
                        addIssue(first, overlappingCategories, overlappingProducts, overlappingFreeTexts);
                        addIssue(second, overlappingCategories, overlappingProducts, overlappingFreeTexts);
                    }
                }

                const columns = Array.from(page.querySelectorAll<HTMLElement>(
                    '[data-drag-column-container="category"][data-drag-column-index]'
                )).sort((left, right) => Number(left.dataset.dragColumnIndex) - Number(right.dataset.dragColumnIndex));
                for (let columnIndex = 1; columnIndex < columns.length; columnIndex += 1) {
                    const previousColumn = columns[columnIndex - 1];
                    const currentColumn = columns[columnIndex];
                    const previousChunks = Array.from(previousColumn.children).filter((child): child is HTMLElement => (
                        child instanceof HTMLElement && Boolean(child.dataset.categoryChunk)
                    ));
                    const currentChunks = Array.from(currentColumn.children).filter((child): child is HTMLElement => (
                        child instanceof HTMLElement && Boolean(child.dataset.categoryChunk)
                    ));
                    const firstCurrentChunk = currentChunks[0];
                    if (!firstCurrentChunk) continue;
                    const previousRect = previousColumn.getBoundingClientRect();
                    const lastPreviousBottom = previousChunks.length > 0
                        ? Math.max(...previousChunks.map(chunk => chunk.getBoundingClientRect().bottom))
                        : previousRect.top;
                    const availableHeight = previousRect.bottom - lastPreviousBottom;
                    const requiredHeight = firstCurrentChunk.getBoundingClientRect().height + 12 * pageScale;
                    if (availableHeight >= requiredHeight) {
                        hasColumnGap = true;
                        break;
                    }
                }
            });

            const nextDiagnostics: LayoutDiagnostics = {
                overlappingCategoryIds: Array.from(overlappingCategories).sort(),
                overlappingProductIds: Array.from(overlappingProducts).sort(),
                overlappingFreeTextIds: Array.from(overlappingFreeTexts).sort(),
                offCanvasCategoryIds: Array.from(offCanvasCategories).sort(),
                offCanvasProductIds: Array.from(offCanvasProducts).sort(),
                offCanvasFreeTextIds: Array.from(offCanvasFreeTexts).sort(),
                hasColumnGap,
            };
            setLayoutDiagnostics(current => (
                JSON.stringify(current) === JSON.stringify(nextDiagnostics) ? current : nextDiagnostics
            ));
        };

        const scheduleScan = () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            if (settleFrameId !== null) window.cancelAnimationFrame(settleFrameId);
            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                scanLayout();
                settleFrameId = window.requestAnimationFrame(() => {
                    settleFrameId = null;
                    scanLayout();
                });
            });
        };
        const observer = new MutationObserver(records => { if (hasMenuContentMutation(records)) scheduleScan(); });
        observer.observe(root, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleScan);
        scheduleScan();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', scheduleScan);
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            if (settleFrameId !== null) window.cancelAnimationFrame(settleFrameId);
        };
    }, [products, style]);

    useEffect(() => {
        const activeKeys = new Set(fontTips.map(tip => `font:${tip.scope}`));
        if (configuredCanvasFonts.length > 1) activeKeys.add('mixed-fonts');
        if (positionedCategoryIds.length > 0) activeKeys.add('free-categories');
        if (layoutDiagnostics.hasColumnGap) activeKeys.add('free-categories');
        if (splitCategoryTipKey) activeKeys.add(splitCategoryTipKey);
        if (overlapIssueCount > 0) activeKeys.add('overlapping-elements');
        if (offCanvasIssueCount > 0) activeKeys.add('off-canvas-elements');
        setDismissedTips(current => {
            const next = new Set(Array.from(current).filter(key => activeKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [configuredCanvasFonts.length, fontTips, layoutDiagnostics.hasColumnGap, offCanvasIssueCount, overlapIssueCount, positionedCategorySignature, splitCategoryTipKey]);

    useEffect(() => {
        const root = containerRef.current;
        const highlighted = root
            ? Array.from(root.querySelectorAll<HTMLElement>('.automenu-tip-font-highlight'))
            : [];
        highlighted.forEach(element => element.classList.remove('automenu-tip-font-highlight'));
        if (!hoveredFontScope || !root) return;

        const affected = Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit-reduced="true"]'))
            .filter(element => element.dataset.wordFitScope === hoveredFontScope);
        affected.forEach(element => element.classList.add('automenu-tip-font-highlight'));
        return () => affected.forEach(element => element.classList.remove('automenu-tip-font-highlight'));
    }, [hoveredFontScope, fontTips]);

    useEffect(() => {
        if (hasVisibleTips) return;
        setTipsOpen(false);
        setHoveredFontScope(null);
    }, [hasVisibleTips]);

    React.useLayoutEffect(() => {
        const layer = zoomLayerRef.current;
        const frame = zoomFrameRef.current;
        if (!layer || !frame) return;
        const measure = () => {
            frame.style.setProperty('--canvas-layout-width', `${layer.offsetWidth}px`);
            frame.style.setProperty('--canvas-layout-height', `${layer.offsetHeight}px`);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(layer);
        return () => observer.disconnect();
    }, []);

    const updateZoomActivity = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        if (!container.hasAttribute('data-canvas-zooming')) container.setAttribute('data-canvas-zooming', '');
        window.clearTimeout(zoomActivityTimer.current);
        if (!zoomInputs.current.pinch && !zoomInputs.current.buttons) {
            zoomActivityTimer.current = window.setTimeout(() => {
                flushSync(() => setScale(scaleRef.current));
                container.removeAttribute('data-canvas-zooming');
            }, 180);
        }
    }, []);

    const updatePinchActivity = useCallback((pinching: boolean) => {
        zoomInputs.current.pinch = pinching;
        updateZoomActivity();
    }, [updateZoomActivity]);

    const updateZoomButtonActivity = useCallback((holding: boolean) => {
        zoomInputs.current.buttons = holding;
        updateZoomActivity();
    }, [updateZoomActivity]);

    useEffect(() => () => {
        window.clearTimeout(zoomActivityTimer.current);
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        window.cancelAnimationFrame(zoomFrameRequest.current);
    }, []);

    const zoomAt = useCallback((value: number, point: CanvasPoint, anchor: CanvasPoint) => {
        const next = Math.min(2.5, Math.max(0.3, value));
        scaleRef.current = next;
        pendingZoom.current = { scale: next, point, anchor };
        updateZoomActivity();
        if (!zoomFrameRequest.current) {
            zoomFrameRequest.current = window.requestAnimationFrame(() => {
                zoomFrameRequest.current = 0;
                const request = pendingZoom.current;
                pendingZoom.current = null;
                const canvas = canvasZoomRef.current;
                const layer = zoomLayerRef.current;
                const frame = zoomFrameRef.current;
                if (!request || request.scale !== scaleRef.current || !canvas || !layer || !frame) return;
                const actualScale = request.scale * zoomMultiplier;
                layer.style.transform = `scale(${actualScale})`;
                frame.style.setProperty('--canvas-render-scale', String(actualScale));
                restoreZoomAnchor(canvas, layer, request.anchor, request.point, actualScale);
                const indicator = zoomIndicatorRef.current;
                const label = indicator?.querySelector('[data-canvas-zoom-value]');
                if (label) label.textContent = request.scale.toFixed(1);
                indicator?.setAttribute('data-visible', 'true');
            });
        }
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => zoomIndicatorRef.current?.removeAttribute('data-visible'), 2000);
    }, [updateZoomActivity, zoomMultiplier]);

    const updateZoom = useCallback((delta: number) => {
        const canvas = canvasZoomRef.current;
        const layer = zoomLayerRef.current;
        if (!canvas || !layer) return false;
        const next = Math.min(2.5, Math.max(0.3, scaleRef.current + delta));
        if (next === scaleRef.current) return false;
        const bounds = getCanvasViewportBounds(canvas);
        const focus = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        zoomAt(next, focus, getZoomAnchor(layer, focus));
    }, [zoomAt]);

    useEffect(() => {
        const canvas = canvasZoomRef.current;
        const layer = zoomLayerRef.current;
        if (canvas && layer) return bindCanvasZoomGestures(canvas, layer, () => scaleRef.current, zoomAt, updatePinchActivity);
    }, [zoomAt, updatePinchActivity]);

    const { handlePrint, printDialog, fileExports, onPageCountChange } = useCanvasPrinting({
        containerRef, products, style, setStyle, sortOption, selectedPages: selectedPrintPages, menuId: currentMenuId,
        printRequestId, onPrintDownloadChange, silentPrintOptions,
    });

    React.useImperativeHandle(fileExportRef, () => fileExports, [fileExports]);
    const updatePageCount = useCallback((pageCount: number) => {
        onPageCountChange(pageCount);
        onExportablePagesChange?.(pageCount);
    }, [onPageCountChange, onExportablePagesChange]);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const { scrollLeft: left, scrollTop: top } = event.currentTarget;
        if (left === canvasScrollPosition.current.left && top === canvasScrollPosition.current.top) return;
        canvasScrollPosition.current = { left, top };
        onCanvasScroll?.();
    };

    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;

        const target = e.target as HTMLElement;
        if (target.closest('[data-menu-print-page="true"], [data-drag-type], [data-added-image-drag="true"], button, input, textarea, select, [contenteditable="true"], [data-drag-ignore="true"]')) {
            return;
        }

        canvasPanRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: e.currentTarget.scrollLeft,
            scrollTop: e.currentTarget.scrollTop,
            isPanning: false,
        };
    };

    const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const pan = canvasPanRef.current;
        if (!pan || pan.pointerId !== e.pointerId) return;

        const deltaX = e.clientX - pan.startX;
        const deltaY = e.clientY - pan.startY;

        if (!pan.isPanning) {
            if (Math.hypot(deltaX, deltaY) < 6) return;
            pan.isPanning = true;
            suppressNextCanvasClickRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.style.cursor = 'grabbing';
        }

        e.currentTarget.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
        e.currentTarget.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
        e.preventDefault();
    };

    const handleCanvasPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        const pan = canvasPanRef.current;
        if (!pan || pan.pointerId !== e.pointerId) return;

        if (pan.isPanning) {
            e.preventDefault();
            e.stopPropagation();
        }

        canvasPanRef.current = null;
        e.currentTarget.style.cursor = '';
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    const applyTemplate = (template: MenuStyle) =>
        setStyle((current) => applyTemplateToCurrentStyle(current, template));

    const handleResetDesign = () => restoreTemplateSettings((current, template) =>
        applyTemplateToCurrentStyle({ ...current, itemFormattingOverrides: undefined }, template));

    const restoreRuleDefaults = () => restoreTemplateSettings(restoreGeneralRules);

    const handleProductUpdate = (id: string, field: keyof Product, value: any, priceEnteredWithDecimals?: boolean) => {
        if (!setProducts) return;
        const patch: Partial<Product> = field === 'price'
            ? { price: roundPrice(value), ...(priceEnteredWithDecimals !== undefined
                ? { priceEnteredWithDecimals: priceEnteredWithDecimals || undefined } : {}) }
            : { [field]: value };
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    };

    const handleBatchProductUpdate = (updates: { id: string, field: keyof Product, value: any }[]) => {
        if (!setProducts) return;
        setProducts(prev => {
            const updateMap = new Map<string, Record<string, any>>();
            updates.forEach(u => {
                const existing = updateMap.get(u.id) || {};
                existing[u.field] = u.field === 'price' ? roundPrice(u.value) : u.value;
                updateMap.set(u.id, existing);
            });
            return prev.map(p => {
                if (updateMap.has(p.id)) return { ...p, ...updateMap.get(p.id) };
                return p;
            });
        });
    };

    const handleCategoryRename = (oldName: string, newName: string) => {
        if (!setProducts || oldName === newName) return;
        setProducts(prev => prev.map(p => p.category === oldName ? { ...p, category: newName } : p));
        setStyle(prev => {
            const currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0
                ? [...prev.customCategoryOrder]
                : Array.from(new Set(displayProducts.map(product => product.category)));
            Array.from(new Set(displayProducts.map(product => product.category))).forEach(category => {
                if (!currentOrder.includes(category)) currentOrder.push(category);
            });

            const customProductOrder = { ...(prev.customProductOrder || {}) };
            if (customProductOrder[oldName]) {
                customProductOrder[newName] = customProductOrder[oldName];
                delete customProductOrder[oldName];
            }
            const categoryPlacements = { ...(prev.categoryPlacements || {}) };
            if (categoryPlacements[oldName]) {
                categoryPlacements[newName] = categoryPlacements[oldName];
                delete categoryPlacements[oldName];
            }
            const categoryPositions = { ...(prev.categoryPositions || {}) };
            if (categoryPositions[oldName]) {
                categoryPositions[newName] = categoryPositions[oldName];
                delete categoryPositions[oldName];
            }
            const categoryDividerStyles = { ...(prev.categoryDividerStyles || {}) };
            if (categoryDividerStyles[oldName]) {
                categoryDividerStyles[newName] = categoryDividerStyles[oldName];
                delete categoryDividerStyles[oldName];
            }

            return {
                ...prev,
                customCategoryOrder: currentOrder.map(category => category === oldName ? newName : category),
                customProductOrder,
                categoryPlacements,
                categoryPositions,
                categoryDividerStyles,
                itemFormattingOverrides: prev.itemFormattingOverrides?.category ? {
                    ...prev.itemFormattingOverrides,
                    category: Object.fromEntries(Object.entries(prev.itemFormattingOverrides.category)
                        .map(([key, value]) => [key === oldName ? newName : key, value])),
                } : prev.itemFormattingOverrides,
                categoryImages: Object.fromEntries(Object.entries(prev.categoryImages || {}).map(([key, image]) => [key === oldName ? newName : key, image])),
                name: 'Custom',
            };
        });
    };

    const handleMenuTextUpdate = (field: 'menuTitle' | 'menuSubtitle', value: string) => {
        setStyle(prev => ({ ...prev, [field]: value }));
    };

    const handleToggleProductVisibility = (productId: string, visible: boolean) => {
        setStyle(prev => {
            const currentHidden = new Set(prev.hiddenProductIds || []);
            if (visible) currentHidden.delete(productId);
            else currentHidden.add(productId);
            return { ...prev, hiddenProductIds: Array.from(currentHidden), name: 'Custom' };
        });
    };

    const handleDeleteProduct = (productId: string) => {
        if (setProducts) setProducts(prev => prev.filter(p => p.id !== productId));
    };

    const handleAddProduct = (category: string, productId?: string, isFreeText?: boolean, specificId?: string, initialData?: Partial<Product>, options?: { index?: number }) => {
        if (!splitCategoryAcrossPages && !productId) {
            const chunks = document.querySelectorAll(`[data-category-chunk="${CSS.escape(category)}"]`);
            if (chunks.length > 0) {
                const lastChunk = chunks[chunks.length - 1];
                const column = lastChunk.closest('[data-drag-column-container="category"]');
                if (column && column.parentElement?.childElementCount === 3) {
                    const pageContainer = column.closest('[data-menu-print-page="true"]');
                    if (pageContainer) {
                        const lastChunkRect = lastChunk.getBoundingClientRect();
                        const pageRect = pageContainer.getBoundingClientRect();
                        
                        // Calculate scaled threshold
                        const scale = pageRect.width / resolveMenuPageDimensions(style).widthPx;
                        const threshold = pageRect.bottom - (48 * scale) - (40 * scale);
                        
                        if (lastChunkRect.bottom > threshold) {
                            window.dispatchEvent(new CustomEvent('menu-category-limit-reached', { detail: { category } }));
                            return;
                        }
                    }
                }
            }
        }

        if (productId) {
            handleToggleProductVisibility(productId, true);
            return;
        }
        if (setProducts) {
            const newId = specificId || crypto.randomUUID();
            const categoryId = displayProducts.find(p => !p.isFreeText && p.category === category)?.categoryId || crypto.randomUUID();
            if (isFreeText) {
                setProducts(prev => [...prev, {
                    id: newId,
                    name: 'Novo texto',
                    price: 0,
                    description: '',
                    category: category,
                    categoryId: null,
                    image: '',
                    isFreeText: true,
                    styles: { fontSize: 20, color: style.textColor, textAlign: 'left', fontWeight: 'normal' },
                    ...initialData
                }]);
            } else {
                setProducts(prev => [...prev, {
                    id: newId,
                    name: 'Novo item',
                    price: 0,
                    description: 'Descrição',
                    category: category,
                    categoryId,
                    image: '',
                    ...initialData
                }]);
            }
            setStyle(prev => {
                const currentHidden = new Set(prev.hiddenProductIds || []);
                currentHidden.delete(newId);
                const nextStyle = { ...prev, hiddenProductIds: Array.from(currentHidden) };

                if (!isFreeText && typeof options?.index === 'number') {
                    const currentOrder = getOrderedProductsForCategory(category, prev)
                        .map(product => product.id)
                        .filter(id => id !== newId);
                    const insertIndex = Math.max(0, Math.min(options.index, currentOrder.length));
                    currentOrder.splice(insertIndex, 0, newId);
                    nextStyle.customProductOrder = {
                        ...(prev.customProductOrder || {}),
                        [category]: currentOrder,
                    };
                }

                return nextStyle;
            });
        }
    };

    const handleAddCategory = (nearCategory: string, position: 'before' | 'after') => {
        if (!setProducts) return;
        const newCategoryName = `Nova categoria ${Math.floor(Math.random() * 1000)}`;
        const newId = crypto.randomUUID();
        const categoryId = crypto.randomUUID();
        setProducts(prev => [...prev, { id: newId, name: 'Novo item', price: 0, description: 'Descrição', category: newCategoryName, categoryId, image: '' }]);
        setStyle(prev => {
            const distinctCategories = Array.from(new Set(displayProducts.map(p => p.category))).sort();
            let currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0 ? [...prev.customCategoryOrder] : [...distinctCategories];
            distinctCategories.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });
            const targetIdx = currentOrder.indexOf(nearCategory);
            if (targetIdx !== -1) {
                if (position === 'before') { currentOrder.splice(targetIdx, 0, newCategoryName); }
                else { currentOrder.splice(targetIdx + 1, 0, newCategoryName); }
            } else { currentOrder.push(newCategoryName); }
            return {
                ...prev,
                customCategoryOrder: currentOrder,
                name: 'Custom',
            };
        });
    };

    const updateCanvasFocus = useCallback((nextScale: number, apply: () => void) => {
        pendingCanvasFocus.current = null;
        if (Math.abs(nextScale - scaleRef.current) < 0.001) {
            apply();
        } else {
            pendingCanvasFocus.current = { scale: nextScale, apply };
            setScale(nextScale);
        }
    }, []);

    React.useLayoutEffect(() => {
        const pending = pendingCanvasFocus.current;
        if (pending?.scale !== scale) return;
        pendingCanvasFocus.current = null;
        pending.apply();
    }, [scale]);

    const handleCanvasProductEditStart = useCallback((productId: string) => {
        editingProductRef.current = productId;
        onProductEditChange?.(productId);
        pendingCanvasFocus.current = null;
        const canvas = canvasZoomRef.current;
        if (!canvas) return;
        const target = getCanvasProduct(canvas, productId);
        if (!target) return;
        const viewport = getCanvasViewportBounds(canvas);
        const bounds = getCanvasProductBounds(target);
        const usableWidth = Math.max(1, viewport.right - viewport.left - 20);
        const usableHeight = Math.max(1, viewport.bottom - viewport.top - 20);
        const scale = scaleRef.current;
        const preferredScale = isDesktopViewport ? productEditViewRef.current?.scale ?? scale : 1.6;
        const nextScale = Math.max(0.3, Math.min(
            preferredScale,
            scale * usableWidth / Math.max(1, bounds.right - bounds.left),
            scale * usableHeight / Math.max(1, bounds.bottom - bounds.top),
        ));
        if (Math.abs(nextScale - scale) >= 0.001) {
            productEditViewRef.current ??= { scale, scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop };
        }
        updateCanvasFocus(nextScale, () => centerCanvasProduct(canvas, productId));
    }, [isDesktopViewport, onProductEditChange, updateCanvasFocus]);

    const handleCanvasProductEditEnd = useCallback((nextObject?: HTMLElement | null) => {
        editingProductRef.current = null;
        onProductEditChange?.(null);
        pendingCanvasFocus.current = null;
        if (borderFocusFrame.current !== undefined) window.cancelAnimationFrame(borderFocusFrame.current);
        const snapshot = productEditViewRef.current;
        productEditViewRef.current = null;
        const canvas = canvasZoomRef.current;
        const surface = canvas?.firstElementChild as HTMLElement | null;
        surface?.style.removeProperty('padding-right');
        if (!snapshot || !canvas) return;
        updateCanvasFocus(snapshot.scale, () => {
            const left = Math.max(0, Math.min(snapshot.scrollLeft, canvas.scrollWidth - canvas.clientWidth));
            const top = Math.max(0, Math.min(snapshot.scrollTop, canvas.scrollHeight - canvas.clientHeight));
            if (!nextObject?.isConnected) {
                canvas.scrollTo({ left, top });
                return;
            }
            const visible = getCanvasViewportBounds(canvas);
            const rect = nextObject.getBoundingClientRect();
            // Check the target at the restored scroll offsets before moving the canvas.
            const dx = canvas.scrollLeft - left;
            const dy = canvas.scrollTop - top;
            const outsideHorizontally = rect.left + dx < visible.left || rect.right + dx > visible.right;
            const outsideVertically = rect.top + dy < visible.top || rect.bottom + dy > visible.bottom;
            canvas.scrollTo({
                left: outsideHorizontally ? canvas.scrollLeft + (rect.left + rect.right - visible.left - visible.right) / 2 : left,
                top: outsideVertically ? canvas.scrollTop + (rect.top + rect.bottom - visible.top - visible.bottom) / 2 : top,
            });
        });
    }, [onProductEditChange, updateCanvasFocus]);

    useEffect(() => {
        const canvas = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        const wrapper = canvas?.firstElementChild as HTMLElement | null | undefined;
        if (!canvas || !wrapper) return;

        const focusBorder = (event: Event) => {
            const surface = event.target;
            if (!(surface instanceof HTMLElement)) return;
            if (borderFocusFrame.current !== undefined) window.cancelAnimationFrame(borderFocusFrame.current);
            borderFocusFrame.current = window.requestAnimationFrame(() => {
                borderFocusFrame.current = undefined;
                if (!surface.isConnected) return;
                const strokes = surface.querySelectorAll(':scope > [data-menu-border]');
                if (!strokes.length) return;
                const bounds = [surface, ...strokes].map(element => element.getBoundingClientRect());
                const left = Math.min(...bounds.map(rect => rect.left));
                const right = Math.max(...bounds.map(rect => rect.right));
                const top = Math.min(...bounds.map(rect => rect.top));
                const bottom = Math.max(...bounds.map(rect => rect.bottom));
                const viewport = canvas.getBoundingClientRect();
                const padding = 16;
                const sheetHeight = !isDesktopViewport && (isOpen || isProductDesignerOpen)
                    ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--automenu-bottom-sheet-height')) || 45
                    : 0;
                const visibleHeight = Math.min(canvas.clientHeight, window.innerHeight * (1 - sheetHeight / 100) - viewport.top);
                if (visibleHeight <= padding * 2) return;
                if (left >= viewport.left + padding && right <= viewport.right - padding
                    && top >= viewport.top + padding && bottom <= viewport.top + visibleHeight - padding) return;

                if (editingProductRef.current && !productEditViewRef.current) {
                    productEditViewRef.current = { scale, scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop };
                }
                const wrapperRect = wrapper.getBoundingClientRect();
                const currentRenderScale = wrapperRect.width / wrapper.offsetWidth || renderScale;
                const ratio = Math.min(1,
                    (canvas.clientWidth - padding * 2) / Math.max(1, right - left),
                    (visibleHeight - padding * 2) / Math.max(1, bottom - top));
                const nextScale = Math.max(0.3, Math.min(scale, scale * ratio * currentRenderScale / renderScale));
                if (ratio < 1) {
                    // Apply the new scale before measuring the border's position.
                    wrapper.style.transitionProperty = 'none';
                    flushSync(() => setScale(nextScale));
                }
                const nextWrapper = wrapper.getBoundingClientRect();
                const zoomRatio = nextWrapper.width / wrapperRect.width || 1;
                canvas.scrollTo({
                    left: canvas.scrollLeft + nextWrapper.left + ((left + right) / 2 - wrapperRect.left) * zoomRatio - viewport.left - canvas.clientWidth / 2,
                    top: canvas.scrollTop + nextWrapper.top + ((top + bottom) / 2 - wrapperRect.top) * zoomRatio - viewport.top - visibleHeight / 2,
                });
                wrapper.style.removeProperty('transition-property');
                if (ratio < 1) canvas.dispatchEvent(new Event('scroll'));
            });
        };
        canvas.addEventListener('automenu:border-offset-increase', focusBorder);
        return () => {
            canvas.removeEventListener('automenu:border-offset-increase', focusBorder);
            if (borderFocusFrame.current !== undefined) window.cancelAnimationFrame(borderFocusFrame.current);
        };
    }, [isDesktopViewport, isOpen, isProductDesignerOpen, renderScale, scale]);

    const handleProductImageUpload = async (productId: string, file: File, type: 'product' | 'category' = 'product') => {
        if (!setProducts) throw new Error('Não foi possível alterar a imagem.');
        const optimizedFile = await optimizeImageForUpload(file, 1400);
        const uploaded = await uploadFileAsset({
            workspaceId,
            userId: currentUserId,
            bucket: type === 'category' ? 'menu-assets' : 'product-images',
            assetType: type === 'category' ? 'added_image' : 'product_image',
            file: optimizedFile,
            metadata: type === 'category' ? { category_name: productId, role: 'category_image' } : { product_id: productId },
        });
        await preloadImage(uploaded.url);
        return { url: uploaded.url, assetId: uploaded.asset.id };
    };

    const getVisibleMoveNeighborId = (
        entries: RenderedMoveEntry[],
        currentId: string,
        direction: MoveDirection,
    ) => {
        const current = entries.find((entry) => entry.id === currentId);
        if (!current) return null;

        const overlap = (
            aStart: number,
            aEnd: number,
            bStart: number,
            bEnd: number,
        ) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

        const candidates = entries.filter((entry) => {
            if (entry.id === currentId) return false;
            if (direction === 'left') return entry.pageIndex === current.pageIndex && entry.centerX < current.centerX - 1;
            if (direction === 'right') return entry.pageIndex === current.pageIndex && entry.centerX > current.centerX + 1;
            if (direction === 'up') return entry.pageIndex < current.pageIndex || (entry.pageIndex === current.pageIndex && entry.centerY < current.centerY - 1);
            return entry.pageIndex > current.pageIndex || (entry.pageIndex === current.pageIndex && entry.centerY > current.centerY + 1);
        });

        const scored = candidates.map((entry) => {
            if (direction === 'left' || direction === 'right') {
                const primaryDistance = direction === 'left'
                    ? Math.max(0, current.left - entry.right)
                    : Math.max(0, entry.left - current.right);
                const sharedRow = overlap(current.top, current.bottom, entry.top, entry.bottom) > 0;
                return {
                    id: entry.id,
                    score: (sharedRow ? 0 : 100000) + primaryDistance + Math.abs(entry.centerY - current.centerY),
                };
            }

            const primaryDistance = direction === 'up'
                ? Math.max(0, current.top - entry.bottom)
                : Math.max(0, entry.top - current.bottom);
            const pageDistance = Math.abs(entry.pageIndex - current.pageIndex);
            const sharedColumn = overlap(current.left, current.right, entry.left, entry.right) > 0;
            return {
                id: entry.id,
                score: (pageDistance * 1000000) + (sharedColumn ? 0 : 100000) + primaryDistance + Math.abs(entry.centerX - current.centerX),
            };
        });

        scored.sort((left, right) => left.score - right.score);
        return scored[0]?.id || null;
    };

    const getVisibleCategoryNeighborId = (category: string, direction: MoveDirection) => {
        const categoryElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"] [data-drag-type="category"][data-drag-id]') || []
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => {
                const page = element.closest<HTMLElement>('[data-page-index]');
                const rect = element.getBoundingClientRect();
                return {
                    id: element.dataset.dragId || '',
                    pageIndex: Number(page?.dataset.pageIndex ?? 0),
                    columnIndex: Number(element.dataset.dragColumnIndex ?? 0),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                };
            })
            .filter((entry) => Boolean(entry.id));

        return getVisibleMoveNeighborId(categoryElements, category, direction);
    };

    const getHorizontalCategoryInsertion = (category: string, direction: 'left' | 'right') => {
        const categoryElements: RenderedMoveEntry[] = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"] [data-drag-type="category"][data-drag-id]') || []
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => {
                const page = element.closest<HTMLElement>('[data-page-index]');
                const rect = element.getBoundingClientRect();
                return {
                    id: element.dataset.dragId || '',
                    pageIndex: Number(page?.dataset.pageIndex ?? 0),
                    columnIndex: Number(element.dataset.dragColumnIndex ?? 0),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                };
            })
            .filter((entry) => Boolean(entry.id));
        const current = categoryElements.find((entry) => entry.id === category);
        if (!current) return null;

        const targetColumnIndex = current.columnIndex + (direction === 'left' ? -1 : 1);
        if (targetColumnIndex < 0) return null;
        const laneExists = containerRef.current?.querySelector(
            `[data-menu-print-page="true"][data-page-index="${current.pageIndex}"] [data-drag-column-container="category"][data-drag-column-index="${targetColumnIndex}"]`
        );
        if (!laneExists) return null;

        const laneEntries = categoryElements
            .filter((entry) => entry.pageIndex === current.pageIndex && entry.columnIndex === targetColumnIndex)
            .sort((left, right) => left.top - right.top);
        const overlappingEntries = laneEntries
            .map((entry) => ({
                entry,
                overlap: Math.max(0, Math.min(current.bottom, entry.bottom) - Math.max(current.top, entry.top)),
            }))
            .filter((candidate) => candidate.overlap > 0)
            .sort((left, right) => right.overlap - left.overlap || Math.abs(left.entry.centerY - current.centerY) - Math.abs(right.entry.centerY - current.centerY));
        const overlapping = overlappingEntries[0]?.entry;
        if (overlapping) {
            return {
                anchorId: overlapping.id,
                position: 'before' as const,
                pageIndex: current.pageIndex,
                columnIndex: targetColumnIndex,
            };
        }

        const nextEntry = laneEntries.find((entry) => entry.centerY >= current.centerY);
        const anchor = nextEntry || laneEntries[laneEntries.length - 1];
        if (anchor) {
            return {
                anchorId: anchor.id,
                position: nextEntry ? 'before' as const : 'after' as const,
                pageIndex: current.pageIndex,
                columnIndex: targetColumnIndex,
            };
        }

        const nextLaneEntry = categoryElements
            .filter((entry) => entry.pageIndex > current.pageIndex
                || (entry.pageIndex === current.pageIndex && entry.columnIndex > targetColumnIndex))
            .sort((left, right) => left.pageIndex - right.pageIndex || left.columnIndex - right.columnIndex || left.top - right.top)[0];
        const previousLaneEntry = categoryElements
            .filter((entry) => entry.pageIndex < current.pageIndex
                || (entry.pageIndex === current.pageIndex && entry.columnIndex < targetColumnIndex))
            .sort((left, right) => right.pageIndex - left.pageIndex || right.columnIndex - left.columnIndex || right.top - left.top)[0];
        return {
            anchorId: nextLaneEntry?.id || previousLaneEntry?.id || null,
            position: nextLaneEntry ? 'before' as const : 'after' as const,
            pageIndex: current.pageIndex,
            columnIndex: targetColumnIndex,
        };
    };

    const handleMoveCategory = (category: string, direction: MoveDirection) => {
        const horizontalInsertion = direction === 'left' || direction === 'right'
            ? getHorizontalCategoryInsertion(category, direction)
            : null;
        const visibleNeighborId = horizontalInsertion?.anchorId || getVisibleCategoryNeighborId(category, direction);

        setStyle(prev => {
            const distinctCategories = Array.from(new Set(displayProducts.map(p => p.category))).sort();
            let currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0 ? [...prev.customCategoryOrder] : [...distinctCategories];
            distinctCategories.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });
            const idx = currentOrder.indexOf(category);
            if (idx === -1) return prev;
            let newOrder = [...currentOrder];
            const neighborIndex = visibleNeighborId ? currentOrder.indexOf(visibleNeighborId) : -1;
            let orderChanged = false;

            if (horizontalInsertion) {
                const orderWithoutCategory = currentOrder.filter((id) => id !== category);
                const anchorIndex = horizontalInsertion.anchorId
                    ? orderWithoutCategory.indexOf(horizontalInsertion.anchorId)
                    : -1;
                const insertionIndex = anchorIndex === -1
                    ? orderWithoutCategory.length
                    : anchorIndex + (horizontalInsertion.position === 'after' ? 1 : 0);
                newOrder = [...orderWithoutCategory];
                newOrder.splice(insertionIndex, 0, category);
                orderChanged = newOrder.some((id, index) => id !== currentOrder[index]);
            } else if (neighborIndex !== -1) {
                [newOrder[idx], newOrder[neighborIndex]] = [newOrder[neighborIndex], newOrder[idx]];
                orderChanged = neighborIndex !== idx;
            } else if (direction === 'up' || direction === 'left') {
                if (idx > 0) {
                    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                    orderChanged = true;
                }
            } else {
                if (idx < newOrder.length - 1) {
                    [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
                    orderChanged = true;
                }
            }
            const nextCategoryPositions = { ...(prev.categoryPositions || {}) };
            const hadFreePosition = Boolean(nextCategoryPositions[category]);
            const placementChanged = Boolean(horizontalInsertion && (
                prev.categoryPlacements?.[category]?.pageIndex !== horizontalInsertion.pageIndex
                || prev.categoryPlacements?.[category]?.columnIndex !== horizontalInsertion.columnIndex
            ));
            if (!orderChanged && !hadFreePosition && !placementChanged) return prev;
            delete nextCategoryPositions[category];
            return {
                ...prev,
                customCategoryOrder: newOrder,
                categoryPlacements: horizontalInsertion
                    ? {
                        ...(prev.categoryPlacements || {}),
                        [category]: {
                            pageIndex: horizontalInsertion.pageIndex,
                            columnIndex: horizontalInsertion.columnIndex,
                        },
                    }
                    : prev.categoryPlacements,
                categoryPositions: nextCategoryPositions,
                name: 'Custom',
            };
        });
    };

    const getOrderedProductsForCategory = (category: string, currentStyle: MenuStyle) => {
        const categoryProducts = displayProducts.filter(p => p.category === category);
        const customOrder = currentStyle.customProductOrder?.[category];

        return [...categoryProducts].sort((a, b) => {
            if (customOrder) {
                const idxA = customOrder.indexOf(a.id);
                const idxB = customOrder.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
            }

            let valA: any = a[sortOption.field];
            let valB: any = b[sortOption.field];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return sortOption.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortOption.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const getVisibleProductNeighborId = (productId: string, direction: MoveDirection) => {
        const productElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"] [data-drag-type="product"][data-drag-id]') || []
        )
            .filter((element) => element.isConnected && element.getClientRects().length > 0)
            .map((element) => {
                const page = element.closest<HTMLElement>('[data-page-index]');
                const rect = element.getBoundingClientRect();
                return {
                    id: element.dataset.dragId || '',
                    pageIndex: Number(page?.dataset.pageIndex ?? 0),
                    columnIndex: 0,
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                };
            })
            .filter((entry) => Boolean(entry.id));

        if (direction === 'left' || direction === 'right') {
            const current = productElements.find((entry) => entry.id === productId);
            if (!current) return null;
            return productElements
                .filter((entry) => entry.id !== productId
                    && entry.pageIndex === current.pageIndex
                    && (direction === 'left' ? entry.centerX < current.centerX - 1 : entry.centerX > current.centerX + 1)
                    && Math.min(current.bottom, entry.bottom) - Math.max(current.top, entry.top) > 0)
                .sort((left, right) => Math.abs(left.centerX - current.centerX) - Math.abs(right.centerX - current.centerX))[0]?.id || null;
        }

        return getVisibleMoveNeighborId(productElements, productId, direction);
    };

    const handleMoveProduct = (productId: string, category: string, direction: MoveDirection) => {
        const visibleNeighborId = getVisibleProductNeighborId(productId, direction);

        setStyle(prev => {
            const categoryProducts = getOrderedProductsForCategory(category, prev);
            let currentOrder = categoryProducts.map(p => p.id);
            const validIds = new Set(displayProducts.filter(p => p.category === category).map(p => p.id));
            currentOrder = currentOrder.filter(id => validIds.has(id));
            displayProducts.filter(p => p.category === category).forEach(p => { if (!currentOrder.includes(p.id)) currentOrder.push(p.id); });
            const idx = currentOrder.indexOf(productId);
            if (idx === -1) return prev;
            let newOrder = [...currentOrder];
            const neighborIndex = visibleNeighborId && validIds.has(visibleNeighborId)
                ? currentOrder.indexOf(visibleNeighborId)
                : -1;

            if (neighborIndex !== -1 && (direction === 'left' || direction === 'right')) {
                newOrder = insertItemAtOriginalIndex(currentOrder, productId, neighborIndex);
            } else if (neighborIndex !== -1) {
                [newOrder[idx], newOrder[neighborIndex]] = [newOrder[neighborIndex], newOrder[idx]];
            } else if (direction === 'left' || direction === 'right') {
                const columnCount = Math.max(1, prev.columnCount || 1);
                const targetIndex = idx + (direction === 'left' ? -1 : 1);
                if (targetIndex < 0 || targetIndex >= columnCount * Math.ceil(currentOrder.length / columnCount)) return prev;
                newOrder = insertItemAtOriginalIndex(currentOrder, productId, targetIndex);
            } else if (direction === 'up') {
                if (idx === 0) return prev;
                [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
            } else {
                if (idx === newOrder.length - 1) return prev;
                [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
            }
            if (newOrder.every((id, index) => id === currentOrder[index])) return prev;
            return { ...prev, customProductOrder: { ...prev.customProductOrder, [category]: newOrder }, manualProductOrder: true, name: 'Custom' };
        });
    };

    const handleCommitCategoryOrder = (newOrder: string[], movedCategories?: string[]) => {
        setStyle(prev => {
            const categoryPositions = movedCategories && prev.categoryPositions ? { ...prev.categoryPositions } : prev.categoryPositions;
            if (movedCategories && categoryPositions) movedCategories.forEach(id => delete categoryPositions[id]);
            return { ...prev, customCategoryOrder: newOrder, categoryPositions, name: 'Custom' };
        });
    };

    const handleCommitProductOrder = (category: string, newOrder: string[], manuallyChanged: boolean) => {
        setStyle(prev => ({ ...prev, customProductOrder: { ...prev.customProductOrder, [category]: newOrder },
            manualProductOrder: manuallyChanged || prev.manualProductOrder, name: 'Custom' }));
    };

    const updateGlobalElementStyle = (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => {
        if (elementType === 'category' || elementType === 'productName' || elementType === 'productPrice' || elementType === 'productDescription') {
            setSidebarFormatting(elementType === 'category' ? 'category' : 'product', previous => setElementFormatting(previous, elementType, newStyle));
        } else {
            setStyle(previous => setElementFormatting(previous, elementType, newStyle));
        }
        return true;
    };

    const updateFreeTextStyle = (id: string, newStyle: ElementStyle) => {
        if (!setProducts) return false;
        const currentProduct = products.find(product => product.id === id);
        const nextFontSize = Number(newStyle.fontSize);
        const currentFontSize = Number(
            currentProduct?.styles?.fontSize
            || style.elementStyles.productName?.fontSize
            || 18,
        );
        if (
            !style.allowSameWordBreak
            && Number.isFinite(nextFontSize)
            && nextFontSize > currentFontSize
            && !canIncreaseCanvasFontSize('freeText', nextFontSize, `product-name-${id}`)
        ) {
            return false;
        }
        const fontSizeReduced = Number(newStyle.fontSize) > 0
            && Number(currentProduct?.styles?.fontSize) > 0
            && Number(newStyle.fontSize) < Number(currentProduct?.styles?.fontSize);
        const previousFontFamily = currentProduct?.styles?.fontFamily || style.fontFamily;
        setProducts(prev => prev.map(product => product.id === id ? { ...product, styles: newStyle } : product));
        if (newStyle.fontFamily && newStyle.fontFamily !== previousFontFamily) {
            setPendingFontPropagation({ sourceId: id, fontFamily: newStyle.fontFamily });
        }
        if (fontSizeReduced) {
            setStyle(currentStyle => ({ ...currentStyle, pageBreaks: [] }));
        }
        return true;
    };

    const applyPendingFontPropagation = () => {
        if (!pendingFontPropagation) return;
        const nextStyle = applyFontToMenuStyle(style, pendingFontPropagation.fontFamily);
        const nextProducts = applyFontToFreeTexts(products, pendingFontPropagation.fontFamily);
        if (setProductsAndStyle) setProductsAndStyle(nextProducts, nextStyle, 'Fonte aplicada a todos os objetos');
        else {
            setProducts?.(nextProducts);
            setStyle(nextStyle);
        }
        setPendingFontPropagation(null);
    };

    const handleAddShape = (shape: CanvasShape) => {
        const id = crypto.randomUUID();
        const focus = getCanvasViewportFocus(containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas]'));
        const shapeSize = getCanvasShapeDimensions(shape);
        setStyle(previous => {
            const dimensions = resolveMenuPageDimensions(previous);
            const images = previous.addedImages || [];
            const position = positionCanvasImage(focus, dimensions, Math.min(180, dimensions.widthPx / 3), shapeSize.height / shapeSize.width);
            const maxX = dimensions.widthPx - position.width;
            const maxY = dimensions.heightPx - position.width * shapeSize.height / shapeSize.width;
            for (let attempt = 0; attempt < images.length; attempt++) {
                if (!images.some(image => image.pageIndex === position.pageIndex
                    && Math.abs(image.x - position.x) < 2 && Math.abs(image.y - position.y) < 2)) break;
                position.x += position.x + 14 <= maxX ? 14 : -14;
                position.y += position.y + 14 <= maxY ? 14 : -14;
            }
            return { ...previous, name: 'Custom', addedImages: [...images, { id, shape, url: canvasShapeUrl(shape), zIndex: 1, ...position }] };
        });
        setSelection({ type: 'addedImage', id });
    };

    const backgroundPhotoInput = useRef<HTMLInputElement>(null);
    const backgroundOrigins = useRef(new Map<string, { image: AddedImage; index: number }>());

    const movePhotoToBackground = (id: string) => {
        const images = style.addedImages || [];
        const index = images.findIndex(image => image.id === id && !image.shape);
        if (index === -1) return;
        const originKey = crypto.randomUUID();
        backgroundOrigins.current.set(originKey, { image: images[index], index });
        setStyle(previous => moveImageToMenuBackground(previous, id, originKey));
        setSelection({ type: null, id: null });
    };

    const removeBackgroundPhoto = () => {
        setStyle(previous => {
            const origin = backgroundOrigins.current.get(previous.menuBackgroundPhoto?.originKey || '');
            const images = previous.addedImages || [];
            if (!origin || images.some(image => image.id === origin.image.id)) {
                return { ...previous, menuBackgroundPhoto: undefined, name: 'Custom' };
            }
            const addedImages = [...images];
            addedImages.splice(origin.index, 0, origin.image);
            return { ...previous, addedImages, menuBackgroundPhoto: undefined, name: 'Custom' };
        });
    };
    const handleAddedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, asBackground = false) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || pendingImagePreview.current) return;
        const previewUrl = URL.createObjectURL(file);
        pendingImagePreview.current = previewUrl;
        const focus = getCanvasViewportFocus(containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas]'));
        setAddedImageFeedback({ phase: 'loading', previewUrl, focus, aspect: 1 });

        try {
            const uploaded = await uploadFileAsset({
                workspaceId,
                userId: currentUserId,
                bucket: 'menu-assets',
                assetType: asBackground ? 'menu_background' : 'added_image',
                file,
                metadata: { style_id: style.id }
            });
            if (pendingImagePreview.current !== previewUrl) return;
            const newId = crypto.randomUUID();
            const size = await preloadImage(uploaded.url);
            if (pendingImagePreview.current !== previewUrl) return;

            setStyle(prev => {
                if (asBackground) return {
                    ...prev,
                    menuBackgroundPhoto: { url: uploaded.url, assetId: uploaded.asset.id },
                    name: 'Custom',
                };
                const currentImages = prev.addedImages || [];
                const newImage: AddedImage = {
                    id: newId,
                    url: uploaded.url,
                    assetId: uploaded.asset.id,
                    ...positionCanvasImage(focus, resolveMenuPageDimensions(prev), 300, size ? size.height / size.width : 1),
                    zIndex: 1
                };

                return {
                    ...prev,
                    addedImages: [...currentImages, newImage],
                    name: 'Custom'
                };
            });

            if (!asBackground) setSelection({ type: 'addedImage', id: newId });
            setAddedImageFeedback(null);
        } catch {
            if (pendingImagePreview.current === previewUrl) {
                setAddedImageFeedback({ phase: 'error', filename: file.name });
            }
        } finally {
            if (pendingImagePreview.current === previewUrl) {
                pendingImagePreview.current = null;
                URL.revokeObjectURL(previewUrl);
            }
        }
    };

    const selectedFreeText = selection.type === 'freeText' && selection.id ? products.find(p => p.id === selection.id) || null : null;
    const selectedAddedImage = selection.type === 'addedImage' && selection.id ? (style.addedImages || []).find(img => img.id === selection.id) || null : null;
    const getTargetAddedImageIds = () => {
        if (selection.type !== 'addedImage' || !selection.id) return [];
        return selectedAddedImageIds.includes(selection.id) && selectedAddedImageIds.length > 1
            ? selectedAddedImageIds
            : [selection.id];
    };

    const resizeSelectedAddedImages = (delta: number) => {
        const ids = new Set(getTargetAddedImageIds());
        if (!selectedAddedImage || !ids.size) return false;
        const { widthPx, heightPx } = resolveMenuPageDimensions(style);
        const widths = new Map<string, number>();
        for (const image of style.addedImages || []) {
            if (!ids.has(image.id)) continue;
            if (delta < 0) {
                if (image.width > 50) widths.set(image.id, Math.max(50, image.width + delta));
                continue;
            }
            const rendered = document.getElementById(`added-image-${image.pageIndex || 0}-${image.id}`)?.querySelector('img');
            const dimensions = image.shape ? getCanvasShapeDimensions(image.shape) : undefined;
            const ratio = dimensions ? dimensions.height / dimensions.width
                : image.crop ? image.crop.height / (image.crop.width * image.crop.aspect)
                : rendered?.naturalWidth ? rendered.naturalHeight / rendered.naturalWidth : 1;
            const max = Math.max(50, Math.min(widthPx - image.x, (heightPx - image.y) / ratio));
            if (image.width < max) widths.set(image.id, Math.min(max, image.width + delta));
        }
        if (!widths.size) return false;
        setStyle(prev => ({
            ...prev,
            addedImages: prev.addedImages?.map(image => widths.has(image.id) ? { ...image, width: widths.get(image.id)! } : image),
            name: 'Custom',
        }));
        window.dispatchEvent(new CustomEvent('automenu:image-edit-end', { detail: selectedAddedImage.id }));
        return true;
    };

    const removeSelectedAddedImages = () => {
        const ids = new Set(getTargetAddedImageIds());
        if (ids.size === 0) return;
        setStyle(prev => ({
            ...prev,
            addedImages: prev.addedImages?.filter(img => !ids.has(img.id)),
            name: 'Custom'
        }));
        setSelection({ type: null, id: null });
        setSelectedAddedImageIds([]);
    };

    const layerSelectedAddedImages = (direction: 'front' | 'back') => {
        const ids = getTargetAddedImageIds();
        if (ids.length === 0) return;

        setStyle(prev => {
            const images = prev.addedImages || [];
            const nextLayers = getImageLayerIndexes(images, ids, direction);

            return {
                ...prev,
                addedImages: images.map(img => nextLayers.has(img.id) ? { ...img, zIndex: nextLayers.get(img.id) ?? img.zIndex } : img),
                name: 'Custom'
            };
        });
    };

    const dismissTip = (key: string) => {
        setDismissedTips(current => new Set(current).add(key));
        if (key.startsWith('font:')) setHoveredFontScope(null);
    };

    const applyFontSuggestion = (scope: WordFitScope) => {
        const root = containerRef.current;
        if (!root) return;
        const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit="true"]'))
            .filter(element => (
                element.dataset.wordFitScope === scope
                && element.dataset.wordOverflow !== 'true'
                && element.isConnected
                && element.getClientRects().length > 0
            ));
        if (elements.length === 0) return;

        const maximumFontSize = Math.max(...elements.map(element => Number(element.dataset.wordFitBaseSize) || 10));
        const minimumFontSize = Math.max(...elements.map(element => Number(element.dataset.wordFitMinimum) || 10));
        const safeFontSize = getLargestSafeFontSizeForElements(elements, maximumFontSize, minimumFontSize);

        if (scope === 'freeText') {
            setProducts?.(current => current.map(product => (
                product.isFreeText
                    ? { ...product, styles: { ...(product.styles || {}), fontSize: safeFontSize } }
                    : product
            )));
        } else {
            const elementType = scope as keyof MenuStyle['elementStyles'];
            setStyle(current => ({
                ...current,
                elementStyles: {
                    ...current.elementStyles,
                    [elementType]: {
                        ...(current.elementStyles[elementType] || {}),
                        fontSize: safeFontSize,
                    },
                },
                pageBreaks: [],
                name: 'Custom',
            }));
        }

        setFontTips(current => current.filter(tip => tip.scope !== scope));
        setHoveredFontScope(null);
    };

    const applyPositionedCategorySuggestion = () => {
        const categoriesToNormalize = new Set(realCategoryIds);
        setStyle(current => {
            const nextPositions = { ...(current.categoryPositions || {}) };
            const nextPlacements = { ...(current.categoryPlacements || {}) };
            categoriesToNormalize.forEach(category => delete nextPositions[category]);
            categoriesToNormalize.forEach(category => delete nextPlacements[category]);
            return {
                ...current,
                categoryPositions: nextPositions,
                categoryPlacements: nextPlacements,
                pageBreaks: (current.pageBreaks || []).filter(category => !categoriesToNormalize.has(category)),
                name: 'Custom',
            };
        });
    };

    const applyLayoutIssueSuggestion = (issue: 'overlap' | 'offCanvas') => {
        const categoryIds = issue === 'overlap'
            ? layoutDiagnostics.overlappingCategoryIds
            : layoutDiagnostics.offCanvasCategoryIds;
        const productIds = issue === 'overlap'
            ? layoutDiagnostics.overlappingProductIds
            : layoutDiagnostics.offCanvasProductIds;
        const freeTextIds = issue === 'overlap'
            ? layoutDiagnostics.overlappingFreeTextIds
            : layoutDiagnostics.offCanvasFreeTextIds;
        const affectedProductIds = new Set([...productIds, ...freeTextIds]);
        const affectedCategories = new Set(categoryIds);
        products.forEach(product => {
            if (affectedProductIds.has(product.id)) affectedCategories.add(product.category);
        });

        if (affectedProductIds.size > 0) {
            setProducts?.(current => current.map(product => (
                affectedProductIds.has(product.id) && product.customMarginTop
                    ? { ...product, customMarginTop: 0 }
                    : product
            )));
        }
        setStyle(current => {
            const nextPositions = { ...(current.categoryPositions || {}) };
            const nextPlacements = { ...(current.categoryPlacements || {}) };
            affectedCategories.forEach(category => {
                delete nextPositions[category];
                delete nextPlacements[category];
            });
            return {
                ...current,
                categoryPositions: nextPositions,
                categoryPlacements: nextPlacements,
                pageBreaks: (current.pageBreaks || []).filter(category => !affectedCategories.has(category)),
                name: 'Custom',
            };
        });
    };

    const applyMixedFontSuggestion = () => {
        const nextStyle = applyFontToMenuStyle(style, style.fontFamily);
        const nextProducts = applyFontToFreeTexts(products, style.fontFamily);
        if (setProductsAndStyle) setProductsAndStyle(nextProducts, nextStyle, 'Fonte principal aplicada a todos os objetos');
        else {
            setProducts?.(nextProducts);
            setStyle(nextStyle);
        }
        setTipsOpen(false);
    };

    const resolveBackgroundOverlap = (current: MenuStyle, ids: ReadonlySet<string>) => {
        const canvas = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas]');
        if (!canvas || !ids.size) return current;
        const positions = { ...current.freeTextBackgrounds };
        let changed = false;
        for (const { id, position } of scanBackgroundTextOverlap(canvas, current, ids)) {
            if (!position || !positions[id]) continue;
            positions[id] = { ...positions[id], ...position };
            changed = true;
        }
        return changed ? { ...current, name: 'Custom', freeTextBackgrounds: positions } : current;
    };

    const applySingleContrastTip = (tip: ContrastTip, choice: 'color' | 'fill') => {
        const next = applyContrastTip(style, products, tip, choice);
        if (setProductsAndStyle && next.products !== products) setProductsAndStyle(next.products, next.style, 'Contraste ajustado');
        else {
            if (next.products !== products) setProducts?.(next.products);
            if (next.style !== style) setStyle(next.style);
        }
        setContrastTips(current => current.filter(item => item.key !== tip.key));
    };

    const applyAllSuggestions = () => {
        let nextProducts = products;
        let nextStyle = style;
        const appliedFontScopes = new Set<WordFitScope>();
        for (const kind of kindsWithDifferences) {
            const source = standardizationSource(kind);
            if (source) nextStyle = standardizeItemFormatting(nextStyle, kind, source);
        }

        if (showMixedFontTip) {
            nextStyle = applyFontToMenuStyle(nextStyle, style.fontFamily);
            nextProducts = applyFontToFreeTexts(nextProducts, style.fontFamily);
        }

        visibleFontTips.forEach((tip) => {
            const root = containerRef.current;
            if (!root) return;
            const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit="true"]'))
                .filter(element => (
                    element.dataset.wordFitScope === tip.scope
                    && element.dataset.wordOverflow !== 'true'
                    && element.isConnected
                    && element.getClientRects().length > 0
                ));
            if (elements.length === 0) return;
            const maximumFontSize = Math.max(...elements.map(element => Number(element.dataset.wordFitBaseSize) || 10));
            const minimumFontSize = Math.max(...elements.map(element => Number(element.dataset.wordFitMinimum) || 10));
            const safeFontSize = getLargestSafeFontSizeForElements(elements, maximumFontSize, minimumFontSize);

            if (tip.scope === 'freeText') {
                nextProducts = nextProducts.map(product => (
                    product.isFreeText
                        ? { ...product, styles: { ...(product.styles || {}), fontSize: safeFontSize } }
                        : product
                ));
            } else {
                const elementType = tip.scope as keyof MenuStyle['elementStyles'];
                nextStyle = {
                    ...nextStyle,
                    elementStyles: {
                        ...nextStyle.elementStyles,
                        [elementType]: {
                            ...(nextStyle.elementStyles[elementType] || {}),
                            fontSize: safeFontSize,
                        },
                    },
                    pageBreaks: [],
                    name: 'Custom',
                };
            }
            appliedFontScopes.add(tip.scope);
        });

        const affectedProductIds = new Set<string>();
        const affectedCategories = new Set<string>();
        const collectLayoutIssue = (issue: 'overlap' | 'offCanvas') => {
            const categoryIds = issue === 'overlap'
                ? layoutDiagnostics.overlappingCategoryIds
                : layoutDiagnostics.offCanvasCategoryIds;
            const productIds = issue === 'overlap'
                ? layoutDiagnostics.overlappingProductIds
                : layoutDiagnostics.offCanvasProductIds;
            const freeTextIds = issue === 'overlap'
                ? layoutDiagnostics.overlappingFreeTextIds
                : layoutDiagnostics.offCanvasFreeTextIds;
            categoryIds.forEach(id => affectedCategories.add(id));
            [...productIds, ...freeTextIds].forEach(id => affectedProductIds.add(id));
        };
        if (showOverlapTip) collectLayoutIssue('overlap');
        if (showOffCanvasTip) collectLayoutIssue('offCanvas');
        if (showPositionedCategoryTip) realCategoryIds.forEach(id => affectedCategories.add(id));
        nextProducts.forEach(product => {
            if (affectedProductIds.has(product.id)) affectedCategories.add(product.category);
        });
        if (affectedProductIds.size > 0) {
            nextProducts = nextProducts.map(product => (
                affectedProductIds.has(product.id) && product.customMarginTop
                    ? { ...product, customMarginTop: 0 }
                    : product
            ));
        }
        if (affectedCategories.size > 0) {
            const nextPositions = { ...(nextStyle.categoryPositions || {}) };
            const nextPlacements = { ...(nextStyle.categoryPlacements || {}) };
            affectedCategories.forEach(category => {
                delete nextPositions[category];
                delete nextPlacements[category];
            });
            nextStyle = {
                ...nextStyle,
                categoryPositions: nextPositions,
                categoryPlacements: nextPlacements,
                pageBreaks: (nextStyle.pageBreaks || []).filter(category => !affectedCategories.has(category)),
                name: 'Custom',
            };
        }

        if (visibleSplitCategorySwap && nextProducts === products && nextStyle === style) {
            nextStyle = { ...style, ...visibleSplitCategorySwap.layout, name: 'Custom' };
        }
        nextStyle = resolveBackgroundOverlap(nextStyle, new Set(backgroundOverlapTips.map(tip => tip.id)));
        for (const tip of contrastTips) {
            const next = applyContrastTip(nextStyle, nextProducts, tip, 'color');
            nextStyle = next.style;
            nextProducts = next.products;
        }
        setContrastTips([]);
        if (nextProducts !== products || nextStyle !== style) {
            if (setProductsAndStyle) {
                setProductsAndStyle(nextProducts, nextStyle, 'Ajustes sugeridos aplicados');
            } else {
                if (nextProducts !== products) setProducts?.(nextProducts);
                if (nextStyle !== style) setStyle(nextStyle);
            }
        }
        setFontTips(current => current.filter(tip => !appliedFontScopes.has(tip.scope)));
        setLayoutDiagnostics(EMPTY_LAYOUT_DIAGNOSTICS);
        setHoveredFontScope(null);
        setTipsOpen(false);
    };

    const menuPalette = React.useMemo(() => getMenuPalette(style, products.map(product => product.styles?.color)), [style, products]);
    return (
        <CustomMarkerLibraryProvider key={currentUserId} userId={currentUserId}>
        <MenuFontContext.Provider value={configuredCanvasFonts}>
        <MenuColorContext.Provider value={menuPalette}>
        <div className="flex flex-row-reverse h-full bg-slate-100 overflow-hidden relative">
            {addedImageFeedback?.phase === 'error' && (
                <div data-image-insertion-feedback
                    className="absolute left-1/2 top-[4.5rem] z-[90] flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 pr-3 text-slate-800 shadow-lg">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><AlertCircle size={19} /></span>
                    <div role="alert" className="min-w-0">
                        <p className="text-sm font-semibold">Não foi possível adicionar a imagem</p>
                        <p className="truncate text-xs text-slate-500">{addedImageFeedback.filename}</p>
                    </div>
                    <button type="button" aria-label="Dispensar erro de imagem" onClick={() => setAddedImageFeedback(null)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={16} /></button>
                </div>
            )}
            <input ref={backgroundPhotoInput} type="file" accept="image/*" hidden aria-label="Selecionar imagem de fundo"
                onChange={event => void handleAddedImageUpload(event, true)} />
            <FontPropagationPrompt
                request={pendingFontPropagation}
                onApply={applyPendingFontPropagation}
                onDismiss={() => setPendingFontPropagation(null)}
            />

            {/* 1. PREVIEW AREA */}
            <div
                className={`flex-1 w-full relative z-0 bg-slate-200/50 flex flex-col min-w-0 transition-all duration-300 h-full`}
                ref={containerRef}
            >
                <ZoomControls
                    scale={scale}
                    updateZoom={updateZoom}
                    indicatorRef={zoomIndicatorRef}
                    onHoldChange={updateZoomButtonActivity}
                />

                <div ref={tipsAnchorRef} className="absolute left-4 top-20 z-[80] flex items-start">
                    {hasVisibleTips && (
                        <button
                            type="button"
                            onClick={() => setTipsOpen(current => !current)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-base font-bold leading-none text-white shadow-md transition hover:bg-indigo-700"
                            data-fixed-canvas-tip
                            title="Dicas do cardápio"
                            aria-label="Abrir dicas do cardápio"
                            aria-expanded={tipsOpen}
                        >
                            <span aria-hidden="true">?</span>
                        </button>
                    )}

                    {hasVisibleTips && tipsOpen && createPortal(
                            <div ref={tipsPanelRef} data-canvas-tips-menu className="fixed z-[120] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Dicas do cardápio</p>
                                        <p className="text-xs text-slate-500">Ajustes opcionais detectados no layout.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={applyAllSuggestions}
                                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                                        title="Aplicar todas as sugestões"
                                    >
                                        <Check size={15} />
                                        Aplicar todas
                                    </button>
                                </div>

                                <div className="max-h-[min(60vh,32rem)] space-y-4 overflow-y-auto p-4">
                                    {kindsWithDifferences.length > 0 && <section className="space-y-2">
                                        <h3 className="text-xs font-semibold text-slate-800">Sugestão para manter todos no padrão</h3>
                                        {kindsWithDifferences.map(kind => (
                                            <div key={kind} className="flex items-end gap-2 rounded-xl bg-indigo-50 p-3 text-xs">
                                                <label className="min-w-0 flex-1 space-y-1 font-semibold text-slate-700">
                                                    {formattingLabels[kind]}
                                                    <select className="w-full rounded-lg border border-indigo-200 bg-white p-1.5"
                                                        value={standardizationSource(kind)}
                                                        onChange={event => setStandardization({ ...standardization, [kind]: event.target.value })}>
                                                        {formattingGroups[kind].map(([id]) => <option key={id} value={id}>
                                                            {kind === 'category' ? categoryName(id) : products.find(product => product.id === id)?.name || 'Produto sem nome'}
                                                        </option>)}
                                                    </select>
                                                </label>
                                                <button type="button" className="rounded-lg bg-indigo-700 px-2.5 py-1.5 font-semibold text-white"
                                                    aria-label={`Padronizar ${formattingLabels[kind].toLowerCase()}`}
                                                    onClick={() => {
                                                        const source = standardizationSource(kind);
                                                        if (source) setStyle(previous => standardizeItemFormatting(previous, kind, source));
                                                    }}>
                                                    Padronizar
                                                </button>
                                            </div>
                                        ))}
                                    </section>}
                                    {backgroundOverlapTips.length > 0 && <section>
                                        <h3 className="mb-2 text-xs font-semibold text-slate-800">Textos sobrepostos no plano de fundo</h3>
                                        <div className="space-y-2">
                                            {backgroundOverlapTips.map(tip => <div key={tip.id} className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 p-3 text-xs">
                                                <span className="min-w-0 break-words">{tip.label}{!tip.position && ' · Sem espaço livre em todas as páginas'}</span>
                                                <button type="button" disabled={!tip.position}
                                                    onClick={() => setStyle(current => resolveBackgroundOverlap(current, new Set([tip.id])))}
                                                    className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 font-semibold text-indigo-800 disabled:opacity-40">
                                                    Ajustar posição
                                                </button>
                                            </div>)}
                                        </div>
                                    </section>}
                                    {contrastTips.length > 0 && <section>
                                        <h3 className="mb-2 text-xs font-semibold text-slate-800">Textos com pouco contraste</h3>
                                        <div className="space-y-2">
                                            {contrastTips.map(tip => <div key={tip.key} className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-slate-700">
                                                <p className="break-words font-semibold">{tip.label}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" onClick={() => applySingleContrastTip(tip, 'color')}
                                                        className="rounded-lg bg-indigo-700 px-2.5 py-1.5 font-semibold text-white">
                                                        {tip.color ? 'Ajustar cor do texto' : 'Ajustar com preenchimento'}
                                                    </button>
                                                    {tip.color && <button type="button" onClick={() => applySingleContrastTip(tip, 'fill')}
                                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700">
                                                        Adicionar preenchimento
                                                    </button>}
                                                </div>
                                            </div>)}
                                        </div>
                                    </section>}
                                    {visibleSplitCategorySwap && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Manter categoria junta</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    Troque <strong>{categoryName(visibleSplitCategorySwap.category)}</strong> de lugar com <strong>{categoryName(visibleSplitCategorySwap.replacement)}</strong> para manter os produtos das duas categorias juntos.
                                                </p>
                                                <div className="flex shrink-0 gap-1">
                                                    <button type="button" onClick={() => setStyle(current => ({ ...current, ...visibleSplitCategorySwap.layout, name: 'Custom' }))}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
                                                        aria-label="Trocar categorias de lugar" title="Trocar categorias de lugar"><Check size={16} /></button>
                                                    <button type="button" onClick={() => splitCategoryTipKey && dismissTip(splitCategoryTipKey)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
                                                        aria-label="Dispensar dica de categoria" title="Dispensar dica de categoria"><X size={16} /></button>
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                    {showMixedFontTip && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Fontes diferentes</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    O cardápio usa {configuredCanvasFonts.length} fontes. Confirmar aplica <strong>{style.fontFamily}</strong> a todos os objetos.
                                                </p>
                                                <div className="flex shrink-0 gap-1">
                                                    <button type="button" onClick={applyMixedFontSuggestion} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700" title="Usar uma fonte em todo o cardápio" aria-label="Usar uma fonte em todo o cardápio"><Check size={16} /></button>
                                                    <button type="button" onClick={() => dismissTip('mixed-fonts')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700" title="Remover esta dica" aria-label="Remover dica de fontes diferentes"><X size={16} /></button>
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                    {visibleFontTips.length > 0 && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Fontes reduzidas</h3>
                                            <div className="space-y-2">
                                                {visibleFontTips.map(tip => (
                                                    <div
                                                        key={tip.scope}
                                                        onMouseEnter={() => setHoveredFontScope(tip.scope)}
                                                        onMouseLeave={() => setHoveredFontScope(null)}
                                                        className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                                                    >
                                                        <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                            A classe <strong>{WORD_FIT_SCOPE_LABELS[tip.scope]}</strong> tem {tip.count} {tip.count === 1 ? 'texto reduzido' : 'textos reduzidos'}. Confirmar iguala a classe em <strong>{tip.safeFontSize}px</strong>, o maior tamanho que mantém cada palavra inteira.
                                                        </p>
                                                        <div className="flex shrink-0 gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => applyFontSuggestion(tip.scope)}
                                                                className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
                                                                title="Aplicar sugestão"
                                                                aria-label={`Aplicar sugestão para ${WORD_FIT_SCOPE_LABELS[tip.scope]}`}
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => dismissTip(`font:${tip.scope}`)}
                                                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
                                                                title="Remover esta dica"
                                                                aria-label={`Remover dica para ${WORD_FIT_SCOPE_LABELS[tip.scope]}`}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {showOverlapTip && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Elementos sobrepostos</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    {overlapIssueCount} {overlapIssueCount === 1 ? 'elemento está sobreposto' : 'elementos estão sobrepostos'} ({formatLayoutIssueBreakdown(layoutDiagnostics.overlappingCategoryIds.length, layoutDiagnostics.overlappingProductIds.length, layoutDiagnostics.overlappingFreeTextIds.length)}). Corrigir reorganiza somente os itens envolvidos.
                                                </p>
                                                <div className="flex shrink-0 gap-1">
                                                    <button type="button" onClick={() => applyLayoutIssueSuggestion('overlap')} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700" title="Corrigir sobreposições" aria-label="Corrigir sobreposições"><Check size={16} /></button>
                                                    <button type="button" onClick={() => dismissTip('overlapping-elements')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700" title="Remover esta dica" aria-label="Remover dica de elementos sobrepostos"><X size={16} /></button>
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {showOffCanvasTip && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Elementos fora da página</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    {offCanvasIssueCount} {offCanvasIssueCount === 1 ? 'elemento está oculto' : 'elementos estão ocultos'} fora da área visível ({formatLayoutIssueBreakdown(layoutDiagnostics.offCanvasCategoryIds.length, layoutDiagnostics.offCanvasProductIds.length, layoutDiagnostics.offCanvasFreeTextIds.length)}). Corrigir traz esses itens de volta ao fluxo da página.
                                                </p>
                                                <div className="flex shrink-0 gap-1">
                                                    <button type="button" onClick={() => applyLayoutIssueSuggestion('offCanvas')} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700" title="Trazer elementos para a página" aria-label="Trazer elementos para a página"><Check size={16} /></button>
                                                    <button type="button" onClick={() => dismissTip('off-canvas-elements')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700" title="Remover esta dica" aria-label="Remover dica de elementos fora da página"><X size={16} /></button>
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {showPositionedCategoryTip && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Espaços vazios no fluxo</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    Há categorias fora do fluxo normal ou iniciando outra coluna antes da hora. Confirmar mantém a ordem atual e preenche os espaços disponíveis primeiro.
                                                </p>
                                                <div className="flex shrink-0 gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={applyPositionedCategorySuggestion}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
                                                        title="Reposicionar categorias"
                                                        aria-label="Reposicionar categorias"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => dismissTip('free-categories')}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
                                                        title="Remover esta dica"
                                                        aria-label="Remover dica de categorias"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>,
                            document.body,
                    )}
                </div>

                {/* Undo/Redo Controls - Dynamic Positioning for Bottom Sheet */}
                <div data-canvas-control-obstacle className={`fixed right-4 z-[70] flex gap-2 transition-all duration-300 md:absolute md:z-10 ${(isOpen || isProductDesignerOpen) ? 'bottom-[calc(var(--automenu-bottom-sheet-height,45vh)+1rem)] md:bottom-24' : 'bottom-[5.25rem] md:bottom-24'}`}>
                    <button data-canvas-history-control onClick={undo} disabled={!canUndo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canUndo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Desfazer"> <Undo size={16} /> </button>
                    <button data-canvas-history-control onClick={redo} disabled={!canRedo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canRedo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Refazer"> <Redo size={16} /> </button>
                </div>

                <div
                    ref={canvasZoomRef}
                    data-automenu-editor-canvas="true"
                    className="flex-1 overflow-auto custom-scrollbar px-4 pt-20 pb-[max(5rem,calc(var(--automenu-bottom-sheet-height,0vh)+1rem))] md:px-8 md:pt-24 md:pb-8 flex items-start justify-start touch-pan-x touch-pan-y md:cursor-grab"
                    onScroll={handleScroll}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerEnd}
                    onPointerCancel={handleCanvasPointerEnd}
                    onClickCapture={(event) => {
                        if (suppressNextCanvasClickRef.current) {
                            suppressNextCanvasClickRef.current = false;
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                        }
                        const target = event.target;
                        if (target instanceof Element && event.currentTarget.contains(target)
                            && !target.closest('[data-menu-print-page], [data-print-control], button, input, textarea, select, [contenteditable="true"]')) {
                            setSelection({ type: null, id: null });
                        }
                    }}
                    onDoubleClickCapture={(e) => {
                        if (!suppressNextCanvasClickRef.current) return;
                        suppressNextCanvasClickRef.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <div data-canvas-zoom-surface className="relative w-max flex-none">
                        <div ref={zoomFrameRef} className="relative [overflow:clip] [overflow-clip-margin:32px]"
                            style={{
                                '--canvas-render-scale': renderScale,
                                width: 'calc(var(--canvas-layout-width, 0px) * var(--canvas-render-scale))',
                                height: 'calc(var(--canvas-layout-height, 0px) * var(--canvas-render-scale))',
                            } as React.CSSProperties}
                        >
                            <div ref={zoomLayerRef}
                                data-canvas-zoom-layer
                                style={{ transform: `scale(${renderScale})`, minWidth: `${resolveMenuPageDimensions(style).widthPx}px` }}
                                className="absolute left-0 top-0 w-max origin-top-left"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MenuPreview
                                    products={displayProducts}
                                    addedImagePreview={imagePreview}
                                    onMovePhotoToBackground={movePhotoToBackground}
                                    onRemoveBackgroundPhoto={removeBackgroundPhoto}
                                    onChooseBackgroundImage={() => backgroundPhotoInput.current?.click()}
                                    isAddingImage={isAddingImage}
                                    onPasteObjects={(nextProducts, nextStyle, actionLabel = 'Colar') => {
                                        if (setProductsAndStyle) setProductsAndStyle(nextProducts, nextStyle, actionLabel);
                                        else { setProducts?.(nextProducts); setStyle(nextStyle); }
                                    }}
                                    style={style}
                                    sortOption={sortOption}
                                    productsCanChangeCategory={productsCanChangeCategory}
                                    onMoveCategory={handleMoveCategory}
                                    onMoveProduct={handleMoveProduct}
                                    onUpdateProduct={handleProductUpdate}
                                    onUpdateProducts={handleBatchProductUpdate}
                                    onUpdateCategoryName={handleCategoryRename}
                                    onUpdateMenuText={handleMenuTextUpdate}
                                    onCommitCategoryOrder={handleCommitCategoryOrder}
                                    onCommitProductOrder={handleCommitProductOrder}
                                    onToggleProductVisibility={handleToggleProductVisibility}
                                    onAddProduct={handleAddProduct}
                                    onAddCategory={handleAddCategory}
                                    onDeleteProduct={handleDeleteProduct}
                                    onStyleUpdate={setStyle}
                                    externalAction={previewAction}
                                    selection={selection}
                                    onSelectionChange={changeSelection}
                                    onItemFormattingUpdate={updateScopedFormatting}
                                    onSelectedItemsChange={handleCanvasSelectedItems}
                                    undo={undo}
                                    redo={redo}
                                    canUndo={canUndo}
                                    canRedo={canRedo}
                                    scale={renderScale}
                                    splitCategoryAcrossPages={splitCategoryAcrossPages}
                                    onChangeShape={openShapePicker}
                                    onUploadProductImage={handleProductImageUpload}
                                    onProductEditStart={handleCanvasProductEditStart}
                                    onProductEditEnd={handleCanvasProductEditEnd}
                                    onPageCountChange={updatePageCount}
                                    onSplitCategorySwap={setSplitCategorySwap}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div data-canvas-control-overlay className="pointer-events-none absolute inset-0 z-[71] [overflow:clip]" />
            </div>

            {/* 2. SIDEBAR EDITOR */}
            <MenuSidebar
                isOpen={isOpen || false}
                onClose={onClose}
                onPdfClick={() => handlePrint()}
                handleResetDesign={handleResetDesign}
                restoreRuleDefaults={() => void restoreRuleDefaults()}
                onRulesLayoutEditingChange={onRulesLayoutEditingChange}
                style={style}
                setStyle={setStyle}
                templates={templates}
                products={displayProducts}
                currentUserId={currentUserId}
                applyTemplate={applyTemplate}
                onSaveTemplate={onSaveTemplate}
                onPublishTemplate={onPublishTemplate}
                sortOption={sortOption}
                setSortOption={setSortOption}
                selection={selection}
                setSelection={changeSelection}
                formattingScope={formattingKind && {
                    value: activeScope,
                    group: activeGroup >= 0 && activeGroups.length > 1 ? activeGroup + 1 : undefined,
                    change: value => setSelection(previous => ({ ...previous, formattingScope: value })),
                }}
                itemStyle={itemStyle}
                setSidebarFormatting={setSidebarFormatting}
                selectedFreeText={selectedFreeText}
                selectedAddedImage={selectedAddedImage}
                selectedAddedImageIds={selectedAddedImageIds}
                updateFreeTextStyle={updateFreeTextStyle}
                updateGlobalElementStyle={updateGlobalElementStyle}
                setPreviewAction={setPreviewAction}
                onMovePhotoToBackground={movePhotoToBackground}
                handleAddedImageUpload={handleAddedImageUpload}
                isAddingImage={isAddingImage}
                shapePickerRequest={shapePickerRequest}
                onChangeShape={openShapePicker}
                onAddShape={handleAddShape}
                resizeSelectedAddedImages={resizeSelectedAddedImages}
                removeSelectedAddedImages={removeSelectedAddedImages}
                layerSelectedAddedImages={layerSelectedAddedImages}
            />
            {printDialog && (
                <React.Suspense fallback={null}>
                    <PrintCanvasModal {...printDialog} virtualLinkControls={virtualLinkControls} />
                </React.Suspense>
            )}
        </div>
        </MenuColorContext.Provider>
        </MenuFontContext.Provider>
        </CustomMarkerLibraryProvider>
    );
};

export default MenuDesigner;
