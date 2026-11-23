import { useCanvasFileExports } from './useCanvasFileExports';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import type { PdfExportResult } from '../../../infrastructure/browser/pdfExport';
import type { PrintCanvasModalProps, PrintCanvasOptions, PrintPreviewPage } from './PrintCanvasModal';
import { updateCanvasPageSetup } from './updateCanvasPageSetup';

const DEFAULT_PRINT_OPTIONS: PrintCanvasOptions = {
    pageMode: 'all',
    pageRange: '',
    paperSize: 'A4',
    customPaperWidthMm: 210,
    customPaperHeightMm: 297,
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

const getCanvasPrintPaperDefaults = (style: MenuStyle): Pick<
    PrintCanvasOptions,
    'paperSize' | 'orientation' | 'customPaperWidthMm' | 'customPaperHeightMm'
> => {
    const dimensions = resolveMenuPageDimensions(style);
    return {
        paperSize: dimensions.setup.preset,
        orientation: dimensions.setup.orientation,
        customPaperWidthMm: dimensions.setup.widthMm,
        customPaperHeightMm: dimensions.setup.heightMm,
    };
};

const getDefaultPrintOptions = (style: MenuStyle): PrintCanvasOptions => ({
    ...DEFAULT_PRINT_OPTIONS,
    ...getCanvasPrintPaperDefaults(style),
});

interface PrintPreviewCacheEntry {
    revision: number;
    printBackgrounds: boolean;
    pageCount: number;
    pages: Map<number, PrintPreviewPage>;
    assetCache: Map<string, string>;
    queue: Promise<void> | null;
    listeners: Set<(pages: PrintPreviewPage[]) => void>;
}

interface CanvasPrintingOptions {
    containerRef: RefObject<HTMLDivElement | null>;
    products: Product[];
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    sortOption: SortOption;
    splitCategoryAcrossPages: boolean;
    currentPrintPageIndex: number | null;
    printRequestMode: 'download' | 'publish' | 'publish-silent';
    printRequestId: number;
    onPrintComplete?: (result: PdfExportResult) => void;
    onPrintError?: (error: Error) => void;
    onPrintCancel?: () => void;
    silentPrintOptions?: Partial<PrintCanvasOptions>;
    clearCanvasSelection: () => void;
}

export function useCanvasPrinting({
    containerRef, products, style, setStyle, sortOption, splitCategoryAcrossPages, currentPrintPageIndex,
    printRequestMode, printRequestId, onPrintComplete, onPrintError, onPrintCancel, silentPrintOptions, clearCanvasSelection,
}: CanvasPrintingOptions) {
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printSettings, setPrintOptions] = useState<PrintCanvasOptions>(() => getDefaultPrintOptions(style));
    const [lastCompletedPrintOptions, setLastCompletedPrintOptions] = useState<PrintCanvasOptions | null>(null);
    const [activePrintMode, setActivePrintMode] = useState<'download' | 'publish'>('download');
    const [printPageCount, setPrintPageCount] = useState(0);
    const [printPreviewPages, setPrintPreviewPages] = useState<PrintPreviewPage[]>([]);
    const [isPrintPreviewLoading, setIsPrintPreviewLoading] = useState(false);
    const [printPreviewError, setPrintPreviewError] = useState<string | null>(null);
    const printPreviewRevisionRef = useRef(0);
    const printPreviewCachesRef = useRef<Map<string, PrintPreviewCacheEntry>>(new Map());
    const canvasPrintPaperDefaults = getCanvasPrintPaperDefaults(style);
    const printOptions: PrintCanvasOptions = {
        ...printSettings,
        ...canvasPrintPaperDefaults,
        pageMode: printPageCount <= 1 && printSettings.pageMode === 'range' ? 'all' : printSettings.pageMode,
    };

    useEffect(() => {
        if (printPageCount <= 1 && printSettings.pageMode === 'range') {
            setPrintOptions(current => ({ ...current, pageMode: 'all' }));
        }
    }, [printPageCount, printSettings.pageMode]);

    const ensurePrintPreviewPages = useCallback(async ({
        printBackgrounds,
        pageIndexes,
        onProgress,
    }: {
        printBackgrounds: boolean;
        pageIndexes?: number[];
        onProgress?: (pages: PrintPreviewPage[]) => void;
    }) => {
        const revision = printPreviewRevisionRef.current;
        const pageElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
        );
        const requestedIndexes = (pageIndexes || pageElements.map((_, index) => index))
            .filter((index) => index >= 0 && index < pageElements.length);
        const cacheKey = `${revision}:${printBackgrounds ? 'backgrounds' : 'plain'}:${pageElements.length}`;
        let cache = printPreviewCachesRef.current.get(cacheKey);

        if (!cache) {
            cache = {
                revision,
                printBackgrounds,
                pageCount: pageElements.length,
                pages: new Map(),
                assetCache: new Map(),
                queue: null,
                listeners: new Set(),
            };
            printPreviewCachesRef.current.set(cacheKey, cache);
        }

        const getCachedPages = () => Array.from(cache!.pages.values())
            .sort((left, right) => left.pageNumber - right.pageNumber);
        if (onProgress) {
            cache.listeners.add(onProgress);
            onProgress(getCachedPages());
        }

        const previousQueue = cache.queue || Promise.resolve();
        const nextQueue = previousQueue
            .catch(() => undefined)
            .then(async () => {
                const { captureMenuPagePreview } = await import('../../../infrastructure/browser/pdfExport');
                for (const index of requestedIndexes) {
                    if (printPreviewRevisionRef.current !== revision) return;
                    if (cache!.pages.has(index)) continue;

                    const dataUrl = await captureMenuPagePreview(
                        pageElements[index],
                        index + 1,
                        printBackgrounds,
                        cache!.assetCache,
                    );
                    if (printPreviewRevisionRef.current !== revision) return;

                    cache!.pages.set(index, { pageNumber: index + 1, dataUrl });
                    const pages = getCachedPages();
                    cache!.listeners.forEach((listener) => listener(pages));
                }
            });
        cache.queue = nextQueue;

        try {
            await nextQueue;
            return getCachedPages();
        } finally {
            if (cache.queue === nextQueue) cache.queue = null;
            if (onProgress) cache.listeners.delete(onProgress);
        }
    }, []);

    useEffect(() => {
        const warmModules = () => {
            void Promise.all([
                import('./PrintCanvasModal'),
                import('../../../infrastructure/browser/pdfExport'),
            ]).catch(() => undefined);
        };
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        const idleId = idleWindow.requestIdleCallback?.(warmModules, { timeout: 1200 });
        const timeoutId = idleId === undefined ? window.setTimeout(warmModules, 250) : null;

        return () => {
            if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, []);

    useEffect(() => {
        printPreviewRevisionRef.current += 1;
        printPreviewCachesRef.current.clear();
    }, [products, sortOption, splitCategoryAcrossPages, style]);

    const handlePrint = (mode: 'download' | 'publish' = 'download') => {
        setActivePrintMode(mode);
        clearCanvasSelection();
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        const pageCount = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').length || 0;
        setPrintPageCount(pageCount);
        setPrintPreviewError(null);
        setShowPrintModal(true);
    };

    useEffect(() => {
        if (printRequestId <= 0) return;
        if (printRequestMode === 'download' || printRequestMode === 'publish') handlePrint(printRequestMode);
    }, [printRequestId]);

    useEffect(() => {
        if (!showPrintModal) return;

        let cancelled = false;

        setIsPrintPreviewLoading(true);
        setPrintPreviewError(null);

        const generatePreviews = async () => {
            const pageCount = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').length || 0;
            const { resolvePdfPageIndexes } = await import('../../../domain/publishing/printOptions');
            const selectedIndexes = resolvePdfPageIndexes(printOptions, pageCount, currentPrintPageIndex);
            const pageIndexes = Array.from(selectedIndexes).sort((left, right) => left - right);
            if (pageIndexes.length === 0) {
                setPrintPreviewError('Nenhuma página válida está selecionada para o preview.');
                setPrintPreviewPages([]);
                return;
            }

            const selectedPageNumbers = new Set(pageIndexes.map((index) => index + 1));
            const generatedPages = await ensurePrintPreviewPages({
                printBackgrounds: printOptions.printBackgrounds,
                pageIndexes,
                onProgress: (pages) => {
                    if (!cancelled) {
                        setPrintPreviewPages(pages.filter((page) => selectedPageNumbers.has(page.pageNumber)));
                    }
                },
            });
            if (!cancelled) {
                setPrintPreviewPages(generatedPages.filter((page) => selectedPageNumbers.has(page.pageNumber)));
            }
        };

        void generatePreviews()
            .catch((error) => {
                console.warn('[PDF Preview] Falha ao gerar preview', error);
                if (!cancelled) {
                    setPrintPreviewError('Não foi possível gerar a visualização. Tente novamente.');
                }
            })
            .finally(() => {
                if (!cancelled) setIsPrintPreviewLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        currentPrintPageIndex,
        ensurePrintPreviewPages,
        printOptions.pageMode,
        printOptions.pageRange,
        printOptions.printBackgrounds,
        printPageCount,
        showPrintModal,
        style,
    ]);

    const executeCanvasPrint = async () => {
        const pageElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
        );
        const { exportMenuPagesToPdf } = await import('../../../infrastructure/browser/pdfExport');

        return exportMenuPagesToPdf({
            pageElements,
            options: printOptions,
            currentPageIndex: currentPrintPageIndex,
            title: style.menuTitle || 'Cardápio',
            download: true,
        });
    };

    const publishCanvasPdf = async () => {
        try {
            const pageElements = Array.from(
                containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
            );
            const { exportMenuPagesToPdf } = await import('../../../infrastructure/browser/pdfExport');
            const result = await exportMenuPagesToPdf({
                pageElements,
                options: { ...getDefaultPrintOptions(style), scaleMode: 'actual' },
                currentPageIndex: null,
                title: style.menuTitle || 'Cardápio',
                download: false,
            });
            onPrintComplete?.(result);
        } catch (error) {
            console.error('[Publicação] Falha ao gerar PDF para o link virtual', error);
            onPrintError?.(error instanceof Error ? error : new Error(String(error)));
        }
    };

    useEffect(() => {
        if (printRequestId <= 0 || printRequestMode !== 'publish-silent') return;
        clearCanvasSelection();
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        void publishCanvasPdf();
    }, [printRequestId]);

    const directOptions = useMemo(() => {
        const requested = { ...getDefaultPrintOptions(style), ...silentPrintOptions,
            ...lastCompletedPrintOptions, ...getCanvasPrintPaperDefaults(style) };
        if (requested.pageMode === 'current' || (requested.pageMode === 'range' && !requested.pageRange.trim())) {
            return { ...requested, pageMode: 'all' as const };
        }
        return requested;
    }, [style, silentPrintOptions, lastCompletedPrintOptions]);
    const fileExports = useCanvasFileExports(containerRef, style, products, sortOption, directOptions, printPageCount);

    const printDialog: PrintCanvasModalProps | null = showPrintModal ? {
        isOpen: true,
        options: printOptions,
        currentPageIndex: currentPrintPageIndex,
        totalPages: printPageCount,
        previewPages: printPreviewPages,
        previewLoading: isPrintPreviewLoading,
        previewError: printPreviewError,
        onChange: setPrintOptions,
        onPageSetupChange: setup => updateCanvasPageSetup(setStyle, setup, products),
        onClose() {
            setShowPrintModal(false);
            if (activePrintMode === 'publish') onPrintCancel?.();
        },
        onPrint: executeCanvasPrint,
        onComplete() {
            setLastCompletedPrintOptions(printOptions);
            if (activePrintMode === 'publish') {
                setShowPrintModal(false);
                void publishCanvasPdf();
            }
        },
        onError: activePrintMode === 'publish' ? onPrintError : undefined,
    } : null;
    return { handlePrint, printDialog, fileExports, onPageCountChange: setPrintPageCount };
}
