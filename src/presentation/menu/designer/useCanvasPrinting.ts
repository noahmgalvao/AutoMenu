import { resolvePdfPageIndexes } from '../../../domain/publishing/printOptions';
import { useCanvasFileExports } from './useCanvasFileExports';
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
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

interface CanvasPrintingOptions {
    containerRef: RefObject<HTMLDivElement | null>;
    products: Product[];
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    sortOption: SortOption;
    currentPrintPageIndex: number | null;
    printRequestMode: 'download' | 'publish' | 'publish-silent';
    printRequestId: number;
    onPrintComplete?: (result: PdfExportResult, requestId: number) => void;
    onPrintError?: (error: Error, requestId: number) => void;
    onPrintCancel?: (requestId: number) => void;
    silentPrintOptions?: Partial<PrintCanvasOptions>;
    clearCanvasSelection: () => void;
}

export function useCanvasPrinting({
    containerRef, products, style, setStyle, sortOption, currentPrintPageIndex,
    printRequestMode, printRequestId, onPrintComplete, onPrintError, onPrintCancel, silentPrintOptions, clearCanvasSelection,
}: CanvasPrintingOptions) {
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printSettings, setPrintOptions] = useState<PrintCanvasOptions>(() => getDefaultPrintOptions(style));
    const [lastCompletedPrintOptions, setLastCompletedPrintOptions] = useState<PrintCanvasOptions | null>(null);
    const [publicationPrintRequest, setPublicationPrintRequest] = useState<number | null>(null);
    const [printPageCount, setPrintPageCount] = useState(0);
    const [printPreviewPages, setPrintPreviewPages] = useState<PrintPreviewPage[]>([]);
    const [selectedPrintPage, setSelectedPrintPage] = useState<number | null>(null);
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

    const handlePrint = (publicationRequest: number | null = null) => {
        setPublicationPrintRequest(publicationRequest);
        setSelectedPrintPage(currentPrintPageIndex);
        clearCanvasSelection();
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        const pageCount = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').length || 0;
        setPrintPageCount(pageCount);
        setShowPrintModal(true);
    };

    useEffect(() => {
        if (printRequestId <= 0) return;
        if (printRequestMode !== 'publish-silent') handlePrint(printRequestMode === 'publish' ? printRequestId : null);
    }, [printRequestId]);

    useLayoutEffect(() => {
        if (!showPrintModal) { setPrintPreviewPages([]); return; }
        const pages = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]');
        if (!pages) return;
        const indexes = resolvePdfPageIndexes(printOptions, pages.length, selectedPrintPage);
        setPrintPreviewPages(Array.from(pages).flatMap((element, index) => indexes.has(index)
            ? [{ pageNumber: index + 1, element, width: element.offsetWidth, height: element.offsetHeight }] : []));
    }, [containerRef, showPrintModal, printPageCount, selectedPrintPage, printOptions.pageMode, printOptions.pageRange, style, products]);

    const executeCanvasPrint = async () => {
        const pageElements = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []
        );
        const { exportMenuPagesToPdf } = await import('../../../infrastructure/browser/pdfExport');

        return exportMenuPagesToPdf({
            pageElements,
            options: printOptions,
            currentPageIndex: selectedPrintPage,
            title: style.menuTitle || 'Cardápio',
            download: true,
        });
    };

    const publishCanvasPdf = async (requestId: number) => {
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
            onPrintComplete?.(result, requestId);
        } catch (error) {
            console.error('[Publicação] Falha ao gerar PDF para o link virtual', error);
            onPrintError?.(error instanceof Error ? error : new Error(String(error)), requestId);
        }
    };

    useEffect(() => {
        if (printRequestId <= 0 || printRequestMode !== 'publish-silent') return;
        clearCanvasSelection();
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        void publishCanvasPdf(printRequestId);
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
        currentPageIndex: selectedPrintPage,
        totalPages: printPageCount,
        previewPages: printPreviewPages,

        onChange: setPrintOptions,
        onPageSetupChange: setup => updateCanvasPageSetup(setStyle, setup, products),
        onClose() {
            setShowPrintModal(false);
            if (publicationPrintRequest !== null) onPrintCancel?.(publicationPrintRequest);
        },
        onPrint: executeCanvasPrint,
        onComplete() {
            setLastCompletedPrintOptions(printOptions);
            if (publicationPrintRequest !== null) {
                setShowPrintModal(false);
                void publishCanvasPdf(publicationPrintRequest);
            }
        },
    } : null;
    return { handlePrint, printDialog, fileExports, onPageCountChange: setPrintPageCount };
}
