import React, { useState, useRef, useEffect } from 'react';
import { Product, MenuStyle, SortOption, ElementStyle, AddedImage } from '../types';
import { PRESET_TEMPLATES } from '../constants';
import { MenuPreview } from './MenuPreview';
import { Undo, Redo, HelpCircle, Check, X } from 'lucide-react';
import { ZoomControls } from './MenuDesigner/ZoomControls';
import { MenuSidebar } from './MenuDesigner/MenuSidebar';
import { PrintCanvasModal, type PrintCanvasOptions, type PrintPreviewPage } from './MenuDesigner/PrintCanvasModal';
import { uploadFileAsset } from '../services/storageService';
import type { MoveDirection, SelectionItem } from '../hooks/interactions/types';
import { getImageLayerIndexes } from '../utils/imageLayers';
import {
    captureMenuPagePreview,
    exportMenuPagesToPdf,
    resolvePdfPageIndexes,
    type PdfDebugEntry,
} from '../utils/pdfExport';
import {
    canIncreaseCanvasFontSize,
    getLargestSafeFontSizeForElements,
    type WordFitScope,
} from '../utils/textFit';
import { roundPrice } from '../utils/price';

interface MenuDesignerProps {
    products: Product[];
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
    templates?: MenuStyle[];
    sortOption: SortOption;
    setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    isOpen?: boolean;
    isProductDesignerOpen?: boolean;
    printRequestId?: number;
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

const DEFAULT_PRINT_OPTIONS: PrintCanvasOptions = {
    pageMode: 'all',
    pageRange: '',
    paperSize: 'A4',
    orientation: 'portrait',
    marginPreset: '0',
    customMarginMm: 0,
    scaleMode: 'fit',
    customScale: 100,
    bleedMm: 0,
    cropMarks: false,
    pageNumbers: false,
    printBackgrounds: true,
    grayscale: false,
    includeCanvasShadow: false,
};

interface FontTip {
    scope: WordFitScope;
    count: number;
    safeFontSize: number;
}

const WORD_FIT_SCOPE_LABELS: Record<WordFitScope, string> = {
    menuTitle: 'títulos principais',
    menuSubtitle: 'subtítulos',
    category: 'categorias',
    productName: 'nomes dos produtos',
    productPrice: 'preços',
    productDescription: 'descrições dos produtos',
    freeText: 'textos livres',
};

const MenuDesigner: React.FC<MenuDesignerProps> = ({ products, style, setStyle, setProducts, templates = [], sortOption, setSortOption, undo, redo, canUndo, canRedo, isOpen = true, isProductDesignerOpen = false, printRequestId = 0, onClose, onScrollActivity, workspaceId, currentUserId, splitCategoryAcrossPages = false, productsCanChangeCategory = false }) => {
    const [scale, setScale] = useState(DEFAULT_PREVIEW_ZOOM);
    const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.matchMedia('(min-width: 768px)').matches);
    const renderScale = scale * (isDesktopViewport ? DESKTOP_PREVIEW_ZOOM_RENDER_MULTIPLIER : MOBILE_PREVIEW_ZOOM_RENDER_MULTIPLIER);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printOptions, setPrintOptions] = useState<PrintCanvasOptions>(DEFAULT_PRINT_OPTIONS);
    const [printPageCount, setPrintPageCount] = useState(0);
    const [printPreviewPages, setPrintPreviewPages] = useState<PrintPreviewPage[]>([]);
    const [isPrintPreviewLoading, setIsPrintPreviewLoading] = useState(false);
    const [printPreviewError, setPrintPreviewError] = useState<string | null>(null);
    const [tipsOpen, setTipsOpen] = useState(false);
    const [fontTips, setFontTips] = useState<FontTip[]>([]);
    const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
    const [hoveredFontScope, setHoveredFontScope] = useState<WordFitScope | null>(null);

    // Zoom Indicator State
    const [showZoomInfo, setShowZoomInfo] = useState(false);
    const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const canvasPanRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        scrollLeft: number;
        scrollTop: number;
        isPanning: boolean;
    } | null>(null);
    const suppressNextCanvasClickRef = useRef(false);

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
    const showPositionedCategoryTip = positionedCategoryIds.length > 0 && !dismissedTips.has('free-categories');
    const hasVisibleTips = visibleFontTips.length > 0 || showPositionedCategoryTip;

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const syncViewport = () => setIsDesktopViewport(mediaQuery.matches);
        syncViewport();
        mediaQuery.addEventListener('change', syncViewport);
        return () => mediaQuery.removeEventListener('change', syncViewport);
    }, []);

    useEffect(() => {
        const root = containerRef.current?.querySelector<HTMLElement>('[data-automenu-editor-canvas="true"]');
        if (!root) return;

        let frameId: number | null = null;
        const scanFontTips = () => {
            frameId = null;
            const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit="true"]'))
                .filter(element => element.isConnected && element.getClientRects().length > 0);
            const reducedElements = elements.filter(element => element.dataset.wordFitReduced === 'true');
            const scopes = Array.from(new Set(
                reducedElements
                    .map(element => element.dataset.wordFitScope as WordFitScope | undefined)
                    .filter((scope): scope is WordFitScope => Boolean(scope && WORD_FIT_SCOPE_LABELS[scope]))
            ));
            const nextTips = scopes.map(scope => {
                const scopeElements = elements.filter(element => element.dataset.wordFitScope === scope);
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
            attributeFilter: ['data-word-fit-reduced', 'data-word-fit-size', 'data-word-fit-base-size'],
        });
        scheduleScan();

        return () => {
            observer.disconnect();
            if (frameId !== null) window.cancelAnimationFrame(frameId);
        };
    }, [products, renderScale, style]);

    useEffect(() => {
        const activeKeys = new Set(fontTips.map(tip => `font:${tip.scope}`));
        if (positionedCategoryIds.length > 0) activeKeys.add('free-categories');
        setDismissedTips(current => {
            const next = new Set(Array.from(current).filter(key => activeKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [fontTips, positionedCategorySignature]);

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

    const handlePrint = () => {
        setSelection({ type: null, id: null });
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        const pageCount = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').length || 0;
        setPrintPageCount(pageCount);
        setPrintPreviewPages([]);
        setPrintPreviewError(null);
        setShowPrintModal(true);
    };

    useEffect(() => {
        if (printRequestId <= 0) return;
        handlePrint();
    }, [printRequestId]);

    useEffect(() => {
        if (!showPrintModal) return;

        const pageElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
        );
        const selectedIndexes = resolvePdfPageIndexes(printOptions, pageElements.length, currentPrintPageIndex);
        const pagesToPreview = pageElements
            .map((element, index) => ({ element, index }))
            .filter(({ index }) => selectedIndexes.has(index));
        let cancelled = false;

        if (pagesToPreview.length === 0) {
            setPrintPreviewPages([]);
            setPrintPreviewError('Nenhuma página válida está selecionada para o preview.');
            setIsPrintPreviewLoading(false);
            return;
        }

        setIsPrintPreviewLoading(true);
        setPrintPreviewError(null);
        setPrintPreviewPages([]);

        const generatePreviews = async () => {
            const nextPreviews: PrintPreviewPage[] = [];
            for (const { element, index } of pagesToPreview) {
                try {
                    const dataUrl = await captureMenuPagePreview(element, index + 1, printOptions.printBackgrounds);
                    nextPreviews.push({ pageNumber: index + 1, dataUrl });
                    if (!cancelled) setPrintPreviewPages([...nextPreviews]);
                } catch (error) {
                    console.warn(`[PDF Preview] Falha na página ${index + 1}`, error);
                    if (!cancelled) {
                        setPrintPreviewError(`Não foi possível gerar o preview da página ${index + 1}. O diagnóstico do download mostrará o motivo técnico.`);
                    }
                    break;
                }
            }
        };

        void generatePreviews().finally(() => {
            if (!cancelled) setIsPrintPreviewLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [
        currentPrintPageIndex,
        printOptions.pageMode,
        printOptions.pageRange,
        printOptions.printBackgrounds,
        printPageCount,
        showPrintModal,
    ]);

    const executeCanvasPrint = async (onDebug: (entry: PdfDebugEntry) => void) => {
        const pageElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
        );

        return exportMenuPagesToPdf({
            pageElements,
            options: printOptions,
            currentPageIndex: currentPrintPageIndex,
            title: style.menuTitle || 'Cardápio',
            onDebug,
        });
    };

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

    const handleResetDesign = () => {
        // 1. Find source of truth (Preset or Imported Template)
        let originalTemplate = PRESET_TEMPLATES.find(t => t.id === style.id);
        if (!originalTemplate) {
            originalTemplate = templates.find(t => t.id === style.id);
        }
        if (!originalTemplate) originalTemplate = PRESET_TEMPLATES[0];

        // 2. Apply Visual Styles (Preserve Content)
        setStyle(prev => ({
            ...prev,
            fontFamily: originalTemplate!.fontFamily,
            primaryColor: originalTemplate!.primaryColor,
            backgroundColor: originalTemplate!.backgroundColor,
            textColor: originalTemplate!.textColor,
            backgroundImage: originalTemplate!.backgroundImage,
            layoutMode: originalTemplate!.layoutMode,
            showImages: originalTemplate!.showImages,
            columnCount: originalTemplate!.columnCount,
            imageScale: originalTemplate!.imageScale ?? 1,
            elementStyles: JSON.parse(JSON.stringify(originalTemplate!.elementStyles || prev.elementStyles)), // Deep copy
            elementColorOverrides: {},

            // Preserve User Content
            id: prev.id,
            menuTitle: prev.menuTitle,
            menuSubtitle: prev.menuSubtitle,
            customCategoryOrder: prev.customCategoryOrder,
            customProductOrder: prev.customProductOrder,
            hiddenProductIds: prev.hiddenProductIds,
            floatingText: prev.floatingText,
            pageBreaks: prev.pageBreaks,
            addedImages: prev.addedImages, // Preserve custom added images on reset? Usually yes for "content".
            sourceImage: prev.sourceImage || originalTemplate!.sourceImage
        }));
    };

    const applyTemplate = (template: MenuStyle) => {
        setStyle(prev => ({
            ...template,
            customCategoryOrder: prev.customCategoryOrder || [],
            customProductOrder: prev.customProductOrder || {},
            hiddenProductIds: prev.hiddenProductIds || [],
            floatingText: prev.floatingText || [],
            addedImages: prev.addedImages || [],
            menuTitle: prev.menuTitle,
            menuSubtitle: prev.menuSubtitle
        }));
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

            return {
                ...prev,
                customCategoryOrder: currentOrder.map(category => category === oldName ? newName : category),
                customProductOrder,
                categoryPlacements,
                categoryPositions,
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
                        const scale = pageRect.width / 794; // A4_WIDTH_PX
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
            return { ...prev, customCategoryOrder: currentOrder, name: 'Custom' };
        });
    };

    const getVisibleMoveNeighborId = (
        entries: Array<{
            id: string;
            pageIndex: number;
            left: number;
            right: number;
            top: number;
            bottom: number;
            centerX: number;
            centerY: number;
        }>,
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

    const handleMoveCategory = (category: string, direction: MoveDirection) => {
        const visibleNeighborId = getVisibleCategoryNeighborId(category, direction);

        setStyle(prev => {
            const distinctCategories = Array.from(new Set(displayProducts.map(p => p.category))).sort();
            let currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0 ? [...prev.customCategoryOrder] : [...distinctCategories];
            distinctCategories.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });
            const idx = currentOrder.indexOf(category);
            if (idx === -1) return prev;
            const newOrder = [...currentOrder];
            const neighborIndex = visibleNeighborId ? currentOrder.indexOf(visibleNeighborId) : -1;
            let orderChanged = false;

            if (neighborIndex !== -1) {
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
            if (!orderChanged && !hadFreePosition) return prev;
            delete nextCategoryPositions[category];
            return {
                ...prev,
                customCategoryOrder: newOrder,
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
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                };
            })
            .filter((entry) => Boolean(entry.id));

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
            const newOrder = [...currentOrder];
            const neighborIndex = visibleNeighborId && validIds.has(visibleNeighborId)
                ? currentOrder.indexOf(visibleNeighborId)
                : -1;

            if (neighborIndex !== -1) {
                [newOrder[idx], newOrder[neighborIndex]] = [newOrder[neighborIndex], newOrder[idx]];
            } else if (direction === 'up' || direction === 'left') {
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
        setProducts(prev => prev.map(product => product.id === id ? { ...product, styles: newStyle } : product));
        if (fontSizeReduced) {
            setStyle(currentStyle => ({ ...currentStyle, pageBreaks: [] }));
        }
        return true;
    };

    const handleImageResize = (delta: number) => {
        setStyle(prev => {
            const currentScale = prev.imageScale || 1;
            const newScale = Math.max(0.5, Math.min(2, currentScale + delta));
            return { ...prev, imageScale: newScale, name: 'Custom' };
        });
    };

    const handleAddedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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

            setStyle(prev => {
                const currentImages = prev.addedImages || [];
                const maxZ = Math.max(40, ...currentImages.map(img => img.zIndex ?? 11));
                const newImage: AddedImage = {
                    id: newId,
                    url: uploaded.url,
                    assetId: uploaded.asset.id,
                    x: 100, // Default position 100px
                    y: 100, // Default position 100px
                    width: 300, // Default width
                    pageIndex: 0, // Default to first page (could be improved to current view)
                    zIndex: maxZ + 1
                };

                return {
                    ...prev,
                    addedImages: [...currentImages, newImage],
                    name: 'Custom'
                };
            });

            // Automatically select it
            setTimeout(() => {
                setSelection({ type: 'addedImage', id: newId });
            }, 100);

        } catch (err) {
            console.error("Falha ao adicionar imagem", err);
            alert("Não foi possível carregar a imagem.");
        } finally {
            // We can't clear ref here easily as it lives in child, but standard file input behavior is okay
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
        if (ids.size === 0) return;
        setStyle(prev => ({
            ...prev,
            addedImages: prev.addedImages?.map(img => ids.has(img.id) ? { ...img, width: Math.max(50, img.width + delta) } : img),
            name: 'Custom'
        }));
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
        const categoriesToNormalize = new Set(positionedCategoryIds);
        setStyle(current => {
            const nextPositions = { ...(current.categoryPositions || {}) };
            categoriesToNormalize.forEach(category => delete nextPositions[category]);
            return {
                ...current,
                categoryPositions: nextPositions,
                name: 'Custom',
            };
        });
    };

    const applyAllSuggestions = () => {
        visibleFontTips.forEach(tip => applyFontSuggestion(tip.scope));
        if (showPositionedCategoryTip) applyPositionedCategorySuggestion();
    };

    return (
        <div className="flex flex-row-reverse h-full bg-slate-100 overflow-hidden relative">

            {/* 1. PREVIEW AREA */}
            <div
                className={`flex-1 w-full relative bg-slate-200/50 flex flex-col min-w-0 transition-all duration-300 h-full`}
                ref={containerRef}
            >
                <ZoomControls
                    scale={scale}
                    updateZoom={updateZoom}
                    showZoomInfo={showZoomInfo}
                />

                {hasVisibleTips && (
                    <div className="absolute left-1/2 top-3 z-[80] -translate-x-1/2">
                        <button
                            type="button"
                            onClick={() => setTipsOpen(current => !current)}
                            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700"
                            title="Dicas do cardápio"
                            aria-label="Abrir dicas do cardápio"
                            aria-expanded={tipsOpen}
                        >
                            <HelpCircle size={22} />
                        </button>

                        {tipsOpen && (
                            <div className="absolute left-1/2 top-12 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl">
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

                                    {showPositionedCategoryTip && (
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Categorias em posição livre</h3>
                                            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                                                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                                    {positionedCategoryIds.length} {positionedCategoryIds.length === 1 ? 'categoria está' : 'categorias estão'} fora das posições normais. Confirmar mantém a ordem atual e remove os espaços livres entre elas.
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
                )}

                {/* Undo/Redo Controls - Dynamic Positioning for Bottom Sheet */}
                <div className={`absolute right-4 z-[70] md:z-10 flex gap-2 transition-all duration-300 ${(isOpen || isProductDesignerOpen) ? 'bottom-[calc(var(--automenu-bottom-sheet-height,45vh)+0.75rem)] md:bottom-24' : 'bottom-[5.25rem] md:bottom-24'}`}>
                    <button onClick={undo} disabled={!canUndo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canUndo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Desfazer"> <Undo size={16} /> </button>
                    <button onClick={redo} disabled={!canRedo} className={`p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700 transition-all ${!canRedo ? 'text-slate-300 cursor-not-allowed' : ''}`} title="Refazer"> <Redo size={16} /> </button>
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
                        style={{ transform: `scale(${renderScale})`, transformOrigin: 'top left', width: 'fit-content', minWidth: '794px', }}
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
                        />
                    </div>
                    <div style={{ height: '100px', width: '1px' }} />
                </div>
            </div>

            {/* 2. SIDEBAR EDITOR */}
            <MenuSidebar
                isOpen={isOpen || false}
                onClose={onClose}
                handlePrint={handlePrint}
                handleResetDesign={handleResetDesign}
                style={style}
                setStyle={setStyle}
                templates={templates}
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
                handleImageResize={handleImageResize}
                resizeSelectedAddedImages={resizeSelectedAddedImages}
                removeSelectedAddedImages={removeSelectedAddedImages}
                layerSelectedAddedImages={layerSelectedAddedImages}
            />
            <PrintCanvasModal
                isOpen={showPrintModal}
                options={printOptions}
                currentPageIndex={currentPrintPageIndex}
                totalPages={printPageCount}
                previewPages={printPreviewPages}
                previewLoading={isPrintPreviewLoading}
                previewError={printPreviewError}
                onChange={setPrintOptions}
                onClose={() => setShowPrintModal(false)}
                onPrint={executeCanvasPrint}
            />
        </div>
    );
};

export default MenuDesigner;
