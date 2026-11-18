import { applyTemplateToCurrentStyle, getAppliedTemplateId } from '../../application/templates/templateApplication';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { Product, MenuStyle, SortOption, ElementStyle, AddedImage, CanvasShape } from '../../domain/menu/model';
import { PRESET_TEMPLATES } from '../../domain/menu/defaults';
import { MenuPreview } from './canvas/MenuPreview';
import { Undo, Redo, Check, X } from 'lucide-react';
import { ZoomControls } from './designer/ZoomControls';
import { MenuSidebar } from './designer/MenuSidebar';
import type { PrintCanvasOptions } from './designer/PrintCanvasModal';
import { useAppServices } from '../app/AppServicesProvider';
import { useCanvasPrinting } from './designer/useCanvasPrinting';
import type { MoveDirection, SelectionItem } from './interactions/types';
import { canvasShapeUrl, getCanvasShapeDimensions } from '../../domain/menu/canvasShapes';
import { getCanvasViewportFocus, positionCanvasImage } from './canvas/canvasViewport';
import { MenuColorContext, getMenuPalette } from './designer/ColorPicker';
import { getImageLayerIndexes } from '../../domain/menu/imageLayers';
import type { PdfExportResult } from '../../infrastructure/browser/pdfExport';
import {
    canIncreaseCanvasFontSize,
    getLargestSafeFontSizeForElements,
    type WordFitScope,
} from './canvas/textFit';
import { roundPrice } from '../../domain/menu/price';
import { resolveMenuPageDimensions } from '../../domain/menu/pageSetup';
import { optimizeImageForUpload, preloadImage } from '../../infrastructure/browser/imageUpload';
import { FontPropagationPrompt, type FontPropagationRequest } from './FontPropagationPrompt';
import { applyFontToFreeTexts, applyFontToMenuStyle, getConfiguredCanvasFonts } from '../../domain/menu/fontPropagation';

const PrintCanvasModal = React.lazy(() => import('./designer/PrintCanvasModal').then((module) => ({
    default: module.PrintCanvasModal,
})));

interface MenuDesignerProps {
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
    printRequestId?: number;
    printRequestMode?: 'download' | 'download-direct' | 'share-direct' | 'publish' | 'publish-silent';
    onPrintComplete?: (result: PdfExportResult, options: PrintCanvasOptions) => void;
    onPrintError?: (error: Error) => void;
    onPrintCancel?: () => void;
    silentPrintOptions?: Partial<PrintCanvasOptions>;
    onClose?: () => void;
    onScrollActivity?: (isScrolling: boolean) => void;
    workspaceId: string;
    currentUserId: string;
    splitCategoryAcrossPages?: boolean;
    productsCanChangeCategory?: boolean;
}

const DEFAULT_PREVIEW_ZOOM = 1;
const MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER = 0.36;
const DESKTOP_PREVIEW_ZOOM_RENDER_MULTIPLIER = MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER * 1.7;

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

const MenuDesigner: React.FC<MenuDesignerProps> = ({ products, style, setStyle, setProducts, setProductsAndStyle, templates = [], sortOption, setSortOption, undo, redo, onProductEditChange, canUndo, canRedo, isOpen = true, isProductDesignerOpen = false, printRequestId = 0, printRequestMode = 'download', onPrintComplete, onPrintError, onPrintCancel, silentPrintOptions, onClose, onScrollActivity, workspaceId, currentUserId, splitCategoryAcrossPages = false, productsCanChangeCategory = false }) => {
    const { assets: { uploadFileAsset } } = useAppServices();
    const [scale, setScale] = useState(DEFAULT_PREVIEW_ZOOM);
    const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.matchMedia('(min-width: 768px)').matches);
    const renderScale = scale * (isDesktopViewport ? DESKTOP_PREVIEW_ZOOM_RENDER_MULTIPLIER : MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER);
    const [tipsOpen, setTipsOpen] = useState(false);
    const [fontTips, setFontTips] = useState<FontTip[]>([]);
    const [pendingFontPropagation, setPendingFontPropagation] = useState<FontPropagationRequest | null>(null);
    const [layoutDiagnostics, setLayoutDiagnostics] = useState<LayoutDiagnostics>(EMPTY_LAYOUT_DIAGNOSTICS);
    const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
    const [hoveredFontScope, setHoveredFontScope] = useState<WordFitScope | null>(null);
    // Zoom Indicator State
    const [showZoomInfo, setShowZoomInfo] = useState(false);
    const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tipsAnchorRef = useRef<HTMLDivElement>(null);
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
    const productFocusTimer = useRef<number | undefined>(undefined);
    const borderFocusFrame = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!tipsOpen) return;
        const closeTipsOutside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && tipsAnchorRef.current?.contains(target)) return;
            setTipsOpen(false);
            setHoveredFontScope(null);
        };
        document.addEventListener('pointerdown', closeTipsOutside, true);
        return () => document.removeEventListener('pointerdown', closeTipsOutside, true);
    }, [tipsOpen]);

    // State for selection context (What element is user clicking?)
    const [selection, setSelection] = useState<{ type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }>({ type: null, id: null });
    const [selectedCanvasItems, setSelectedCanvasItems] = useState<SelectionItem[]>([]);
    const currentPrintPageIndex = selection.type === 'page' && selection.id !== null ? Number(selection.id) : null;
    // State to trigger imperative actions in Preview from Sidebar
    const [previewAction, setPreviewAction] = useState<{ type: string, id: number } | undefined>(undefined);

    // Pinch to zoom refs
    const initialPinchDistanceRef = useRef<number | null>(null);
    const initialPinchScaleRef = useRef<number | null>(null);

    const displayProducts = products;
    const realCategoryIds = new Set(products.filter(product => !product.isFreeText).map(product => product.category));
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
    const configuredCanvasFonts = getConfiguredCanvasFonts(style, products);
    const showMixedFontTip = configuredCanvasFonts.length > 1 && !dismissedTips.has('mixed-fonts');
    const hasVisibleTips = visibleFontTips.length > 0 || showMixedFontTip || showOverlapTip || showOffCanvasTip || showPositionedCategoryTip;

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
        const observer = new MutationObserver(scheduleScan);
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
    }, [products, renderScale, style]);

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
                    const tolerance = 3;
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
                        if (overlapWidth <= 3 || overlapHeight <= 3) continue;
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
                    const requiredHeight = firstCurrentChunk.getBoundingClientRect().height + Math.max(4, 12 * renderScale);
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
        const observer = new MutationObserver(scheduleScan);
        observer.observe(root, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleScan);
        scheduleScan();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', scheduleScan);
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            if (settleFrameId !== null) window.cancelAnimationFrame(settleFrameId);
        };
    }, [products, renderScale, style]);

    useEffect(() => {
        const activeKeys = new Set(fontTips.map(tip => `font:${tip.scope}`));
        if (configuredCanvasFonts.length > 1) activeKeys.add('mixed-fonts');
        if (positionedCategoryIds.length > 0) activeKeys.add('free-categories');
        if (layoutDiagnostics.hasColumnGap) activeKeys.add('free-categories');
        if (overlapIssueCount > 0) activeKeys.add('overlapping-elements');
        if (offCanvasIssueCount > 0) activeKeys.add('off-canvas-elements');
        setDismissedTips(current => {
            const next = new Set(Array.from(current).filter(key => activeKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [configuredCanvasFonts.length, fontTips, layoutDiagnostics.hasColumnGap, offCanvasIssueCount, overlapIssueCount, positionedCategorySignature]);

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
        const container = containerRef.current;
        const anchor = tipsAnchorRef.current;
        const canvas = container?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!container || !anchor || !canvas) return;

        let animationFrame: number | null = null;
        const updatePosition = () => {
            animationFrame = null;
            const firstPage = canvas.querySelector<HTMLElement>(
                '[data-menu-print-page="true"][data-page-index="0"]'
            );
            if (!firstPage) {
                anchor.style.visibility = 'hidden';
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const pageRect = firstPage.getBoundingClientRect();
            anchor.style.left = `${pageRect.left - containerRect.left}px`;
            anchor.style.top = `${pageRect.top - containerRect.top - anchor.offsetHeight - 4}px`;
            anchor.style.visibility = 'visible';
        };
        const schedulePosition = () => {
            if (animationFrame !== null) return;
            animationFrame = window.requestAnimationFrame(updatePosition);
        };
        const resizeObserver = new ResizeObserver(schedulePosition);
        const mutationObserver = new MutationObserver(schedulePosition);

        resizeObserver.observe(container);
        resizeObserver.observe(canvas);
        mutationObserver.observe(canvas, { childList: true, subtree: true });
        canvas.addEventListener('scroll', schedulePosition, { passive: true });
        window.addEventListener('resize', schedulePosition);
        schedulePosition();

        return () => {
            if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            canvas.removeEventListener('scroll', schedulePosition);
            window.removeEventListener('resize', schedulePosition);
        };
    }, [renderScale]);

    const updateZoom = (delta: number) => {
        const newScale = Math.min(2.5, Math.max(0.3, scale + delta));
        setScale(newScale);

        // Show indicator logic
        setShowZoomInfo(true);
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => {
            setShowZoomInfo(false);
        }, 2000);
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.005;
                updateZoom(delta);
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [scale]);

    const { handlePrint, printDialog } = useCanvasPrinting({
        containerRef, products, style, sortOption, splitCategoryAcrossPages, currentPrintPageIndex,
        printRequestId, printRequestMode, onPrintComplete, onPrintError, onPrintCancel, silentPrintOptions,
        clearCanvasSelection: () => setSelection({ type: null, id: null }),
    });

    // Scroll Activity Handler
    const handleScroll = () => {
        if (onScrollActivity) {
            onScrollActivity(true);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = setTimeout(() => {
                onScrollActivity(false);
            }, 500); // UI reappears after 500ms of no scroll
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            initialPinchDistanceRef.current = dist;
            initialPinchScaleRef.current = scale;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && initialPinchDistanceRef.current !== null && initialPinchScaleRef.current !== null) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const ratio = dist / initialPinchDistanceRef.current;

            const newScale = Math.min(2.5, Math.max(0.3, initialPinchScaleRef.current * ratio));
            setScale(newScale);

            setShowZoomInfo(true);
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            zoomTimeoutRef.current = setTimeout(() => {
                setShowZoomInfo(false);
            }, 2000);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            initialPinchDistanceRef.current = null;
            initialPinchScaleRef.current = null;
        }
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

    const handleResetDesign = () => {
        const id = getAppliedTemplateId(style);
        applyTemplate(templates.find((template) => template.id === id)
            || PRESET_TEMPLATES.find((template) => template.id === id)
            || PRESET_TEMPLATES[0]);
    };

    const handleProductUpdate = (id: string, field: keyof Product, value: any) => {
        if (!setProducts) return;
        const normalizedValue = field === 'price' ? roundPrice(value) : value;
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: normalizedValue } : p));
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

    const handleMobileProductEditStart = useCallback((productId: string) => {
        editingProductRef.current = productId;
        onProductEditChange?.(productId);
        if (window.matchMedia('(min-width: 768px)').matches || productEditViewRef.current) return;
        const canvas = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!canvas) return;
        const snapshot = {
            scale,
            scrollLeft: canvas.scrollLeft,
            scrollTop: canvas.scrollTop,
        };
        productEditViewRef.current = snapshot;
        setScale(1.6);
        productFocusTimer.current = window.setTimeout(() => {
            if (productEditViewRef.current !== snapshot) return;
            const target = Array.from(canvas.querySelectorAll<HTMLElement>('[data-drag-type="product"][data-drag-id]'))
                .find((element) => element.dataset.dragId === productId);
            if (!target) return;
            const canvasRect = canvas.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            canvas.scrollTo({
                left: canvas.scrollLeft + targetRect.left + (targetRect.width / 2) - canvasRect.left - (canvasRect.width / 2),
                top: canvas.scrollTop + targetRect.top + (targetRect.height / 2) - canvasRect.top - (canvasRect.height / 2),
                behavior: 'smooth',
            });
        }, 240);
    }, [onProductEditChange, scale]);

    const handleMobileProductEditEnd = useCallback(() => {
        editingProductRef.current = null;
        onProductEditChange?.(null);
        window.clearTimeout(productFocusTimer.current);
        if (borderFocusFrame.current !== undefined) window.cancelAnimationFrame(borderFocusFrame.current);
        const snapshot = productEditViewRef.current;
        const canvas = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!snapshot || !canvas) return;
        productEditViewRef.current = null;
        setScale(snapshot.scale);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            canvas.scrollTo({ left: snapshot.scrollLeft, top: snapshot.scrollTop });
        }));
    }, [onProductEditChange]);

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

                window.clearTimeout(productFocusTimer.current);
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

    const handleProductImageUpload = async (productId: string, file: File) => {
        if (!setProducts) throw new Error('Não foi possível alterar a imagem.');
        const optimizedFile = await optimizeImageForUpload(file, 1400);
        const uploaded = await uploadFileAsset({
            workspaceId,
            userId: currentUserId,
            bucket: 'product-images',
            assetType: 'product_image',
            file: optimizedFile,
            metadata: { product_id: productId },
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
            return { ...prev, customProductOrder: { ...prev.customProductOrder, [category]: newOrder }, name: 'Custom' };
        });
    };

    const handleCommitCategoryOrder = (newOrder: string[]) => {
        setStyle(prev => ({ ...prev, customCategoryOrder: newOrder, name: 'Custom' }));
    };

    const handleCommitProductOrder = (category: string, newOrder: string[]) => {
        setStyle(prev => ({ ...prev, customProductOrder: { ...prev.customProductOrder, [category]: newOrder }, name: 'Custom' }));
    };

    const updateGlobalElementStyle = (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => {
        setStyle(prev => {
            const previousStyle = prev.elementStyles[elementType] || {};
            const colorChanged = newStyle.color !== previousStyle.color;
            const fontSizeReduced = Number(newStyle.fontSize) > 0
                && Number(previousStyle.fontSize) > 0
                && Number(newStyle.fontSize) < Number(previousStyle.fontSize);
            return {
                ...prev,
                elementStyles: { ...prev.elementStyles, [elementType]: newStyle },
                elementColorOverrides: colorChanged
                    ? { ...(prev.elementColorOverrides || {}), [elementType]: true }
                    : prev.elementColorOverrides,
                pageBreaks: fontSizeReduced ? [] : prev.pageBreaks,
                name: 'Custom'
            };
        });
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
            return {
                ...previous, name: 'Custom',
                addedImages: [...(previous.addedImages || []), {
                    id, shape, url: canvasShapeUrl(shape), zIndex: 1,
                    ...positionCanvasImage(focus, dimensions, Math.min(180, dimensions.widthPx / 3), shapeSize.height / shapeSize.width),
                }],
            };
        });
        setSelection({ type: 'addedImage', id });
    };

    const handleAddedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const focus = getCanvasViewportFocus(containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas]'));

        try {
            const uploaded = await uploadFileAsset({
                workspaceId,
                userId: currentUserId,
                bucket: 'menu-assets',
                assetType: 'added_image',
                file,
                metadata: { style_id: style.id }
            });
            const newId = crypto.randomUUID();
            const size = await preloadImage(uploaded.url);

            setStyle(prev => {
                const currentImages = prev.addedImages || [];
                const maxZ = Math.max(40, ...currentImages.map(img => img.zIndex ?? 11));
                const newImage: AddedImage = {
                    id: newId,
                    url: uploaded.url,
                    assetId: uploaded.asset.id,
                    ...positionCanvasImage(focus, resolveMenuPageDimensions(prev), 300, size ? size.height / size.width : 1),
                    zIndex: maxZ + 1
                };

                return {
                    ...prev,
                    addedImages: [...currentImages, newImage],
                    name: 'Custom'
                };
            });

            setSelection({ type: 'addedImage', id: newId });

        } catch (err) {
            console.error("Falha ao adicionar imagem", err);
            alert("Não foi possível carregar a imagem.");
        }
    };

    const selectedFreeText = selection.type === 'freeText' && selection.id ? products.find(p => p.id === selection.id) || null : null;
    const selectedAddedImage = selection.type === 'addedImage' && selection.id ? (style.addedImages || []).find(img => img.id === selection.id) || null : null;
    const selectedAddedImageIds = selectedCanvasItems
        .filter((item) => item.type === 'addedImage')
        .map((item) => item.id);
    const getTargetAddedImageIds = () => {
        if (selection.type !== 'addedImage' || !selection.id) return [];
        return selectedAddedImageIds.includes(selection.id) && selectedAddedImageIds.length > 1
            ? selectedAddedImageIds
            : [selection.id];
    };

    const resizeSelectedAddedImages = (delta: number) => {
        const ids = new Set(getTargetAddedImageIds());
        if (!selectedAddedImage || !ids.size) return;
        setStyle(prev => ({
            ...prev,
            addedImages: prev.addedImages?.map(img => ids.has(img.id) ? { ...img, width: Math.max(50, img.width + delta) } : img),
            name: 'Custom'
        }));
        if (selectedAddedImage.width !== Math.max(50, selectedAddedImage.width + delta)) {
            window.dispatchEvent(new CustomEvent('automenu:image-edit-end', { detail: selectedAddedImage.id }));
        }
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
        setSelectedCanvasItems([]);
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

    const applyAllSuggestions = () => {
        let nextProducts = products;
        let nextStyle = style;
        const appliedFontScopes = new Set<WordFitScope>();

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
        <MenuColorContext.Provider value={menuPalette}>
        <div className="flex flex-row-reverse h-full bg-slate-100 overflow-hidden relative">
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
                    showZoomInfo={showZoomInfo}
                />

                <div ref={tipsAnchorRef} data-canvas-control-obstacle className="absolute z-[80] flex items-start gap-2" style={{ visibility: 'hidden' }}>
                    {hasVisibleTips && (
                        <button
                            type="button"
                            onClick={() => setTipsOpen(current => !current)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-base font-bold leading-none text-white shadow-md transition hover:bg-indigo-700"
                            title="Dicas do cardápio"
                            aria-label="Abrir dicas do cardápio"
                            aria-expanded={tipsOpen}
                        >
                            <span aria-hidden="true">?</span>
                        </button>
                    )}

                    {hasVisibleTips && tipsOpen && (
                            <div className="absolute left-0 top-10 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl">
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
                            </div>
                    )}
                </div>

                {/* Undo/Redo Controls - Dynamic Positioning for Bottom Sheet */}
                <div data-canvas-control-obstacle className={`fixed right-4 z-[70] flex gap-2 transition-all duration-300 md:absolute md:z-10 ${(isOpen || isProductDesignerOpen) ? 'bottom-[calc(var(--automenu-bottom-sheet-height,45vh)+1rem)] md:bottom-24' : 'bottom-[5.25rem] md:bottom-24'}`}>
                    <button data-canvas-history-control onClick={undo} disabled={!canUndo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canUndo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Desfazer"> <Undo size={16} /> </button>
                    <button data-canvas-history-control onClick={redo} disabled={!canRedo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canRedo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Refazer"> <Redo size={16} /> </button>
                </div>

                <div
                    data-automenu-editor-canvas="true"
                    className="flex-1 overflow-auto custom-scrollbar px-4 pt-20 pb-20 md:px-8 md:pt-24 md:pb-8 flex items-start justify-start touch-pan-x touch-pan-y md:cursor-grab"
                    onScroll={handleScroll}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerEnd}
                    onPointerCancel={handleCanvasPointerEnd}
                    onClickCapture={(e) => {
                        if (!suppressNextCanvasClickRef.current) return;
                        suppressNextCanvasClickRef.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onDoubleClickCapture={(e) => {
                        if (!suppressNextCanvasClickRef.current) return;
                        suppressNextCanvasClickRef.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelection({ type: null, id: null });
                        }
                    }}
                >
                    <div
                        data-canvas-zoom-layer
                        style={{ transform: `scale(${renderScale})`, transformOrigin: 'top left', width: 'fit-content', minWidth: `${resolveMenuPageDimensions(style).widthPx}px`, }}
                        className="transition-transform duration-200 ease-out"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MenuPreview
                            products={displayProducts}
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
                            onSelectionChange={setSelection}
                            onSelectedItemsChange={setSelectedCanvasItems}
                            undo={undo}
                            redo={redo}
                            canUndo={canUndo}
                            canRedo={canRedo}
                            scale={renderScale}
                            splitCategoryAcrossPages={splitCategoryAcrossPages}
                            onUploadProductImage={handleProductImageUpload}
                            onProductEditStart={handleMobileProductEditStart}
                            onProductEditEnd={handleMobileProductEditEnd}
                        />
                    </div>
                    <div style={{ height: '100px', width: '1px' }} />
                </div>
            </div>

            {/* 2. SIDEBAR EDITOR */}
            <MenuSidebar
                isOpen={isOpen || false}
                onClose={onClose}
                onPdfClick={() => handlePrint('download')}
                handleResetDesign={handleResetDesign}
                style={style}
                setStyle={setStyle}
                templates={templates}
                products={displayProducts}
                currentUserId={currentUserId}
                splitCategoryAcrossPages={splitCategoryAcrossPages}
                applyTemplate={applyTemplate}
                sortOption={sortOption}
                setSortOption={setSortOption}
                selection={selection}
                setSelection={setSelection}
                selectedFreeText={selectedFreeText}
                selectedAddedImage={selectedAddedImage}
                selectedAddedImageIds={selectedAddedImageIds}
                updateFreeTextStyle={updateFreeTextStyle}
                updateGlobalElementStyle={updateGlobalElementStyle}
                setPreviewAction={setPreviewAction}
                handleAddedImageUpload={handleAddedImageUpload}
                onAddShape={handleAddShape}
                resizeSelectedAddedImages={resizeSelectedAddedImages}
                removeSelectedAddedImages={removeSelectedAddedImages}
                layerSelectedAddedImages={layerSelectedAddedImages}
            />
            {printDialog && (
                <React.Suspense fallback={null}>
                    <PrintCanvasModal {...printDialog} />
                </React.Suspense>
            )}
        </div>
        </MenuColorContext.Provider>
    );
};

export default MenuDesigner;
