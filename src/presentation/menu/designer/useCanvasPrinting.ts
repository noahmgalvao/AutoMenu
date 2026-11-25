import { resolveImagePages, type ImagePages } from '../../../domain/publishing/imagePages';
import { resolvePdfPageIndexes } from '../../../domain/publishing/printOptions';
import { useCanvasFileExports } from './useCanvasFileExports';
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { downloadBlob } from '../../../infrastructure/browser/shareFiles';
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
    selectedPages: readonly number[];
    menuId?: string;
    printRequestId: number;
    onPrintDownloadChange?: (active: boolean) => void;
    silentPrintOptions?: Partial<PrintCanvasOptions>;
}

const withPageChoice = (options: PrintCanvasOptions, choice: ImagePages, indexes: readonly number[]): PrintCanvasOptions => ({
    ...options,
    pageMode: choice.mode === 'all' ? 'all' : 'range',
    pageRange: choice.mode === 'all' ? '' : indexes.map(index => index + 1).join(','),
});

export function useCanvasPrinting({
    containerRef, products, style, setStyle, sortOption, selectedPages, menuId,
    printRequestId, onPrintDownloadChange, silentPrintOptions,
}: CanvasPrintingOptions) {
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printSettings, setPrintOptions] = useState<PrintCanvasOptions>(() => getDefaultPrintOptions(style));
    const [lastCompletedPrintOptions, setLastCompletedPrintOptions] = useState<PrintCanvasOptions | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [printPageCount, setPrintPageCount] = useState(0);
    const [printPreviewPages, setPrintPreviewPages] = useState<PrintPreviewPage[]>([]);
    const [pageChoice, setPageChoice] = useState<ImagePages>({ mode: 'all' });
    const hasSelection = selectedPages.some(index => index >= 0 && index < printPageCount);
    const choice: ImagePages = pageChoice.mode === 'selection' && !hasSelection ? { mode: 'all' } : pageChoice;
    const chosenIndexes = resolveImagePages(choice, printPageCount, selectedPages);
    const publicationOptions = useMemo<PrintCanvasOptions>(() => ({
        ...getDefaultPrintOptions(style), scaleMode: 'actual',
    }), [style]);
    const printOptions = withPageChoice({ ...printSettings, ...getCanvasPrintPaperDefaults(style) }, choice, chosenIndexes);
    const { pageMode, pageRange } = printOptions;
    const directOptions = useMemo(() => ({
        ...publicationOptions, scaleMode: 'fit' as const, ...silentPrintOptions,
        ...lastCompletedPrintOptions, ...getCanvasPrintPaperDefaults(style), pageMode, pageRange,
    }), [style, publicationOptions, silentPrintOptions, lastCompletedPrintOptions, pageMode, pageRange]);
    const fileExports = useCanvasFileExports(containerRef, style, products, sortOption, directOptions, publicationOptions, printPageCount);

    useEffect(() => setPageChoice({ mode: 'all' }), [menuId]);

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

    const handlePrint = () => {
        document.dispatchEvent(new Event('automenu:close-inline-formatting'));
        const pageCount = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]').length || 0;
        setPrintPageCount(pageCount);
        setShowPrintModal(true);
    };

    useEffect(() => {
        if (printRequestId > 0) handlePrint();
    }, [printRequestId]);

    useLayoutEffect(() => {
        if (!showPrintModal) { setPrintPreviewPages([]); return; }
        const pages = containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]');
        if (!pages) return;
        const indexes = resolvePdfPageIndexes(printOptions, pages.length, null);
        setPrintPreviewPages(Array.from(pages).flatMap((element, index) => indexes.has(index)
            ? [{ pageNumber: index + 1, element, width: element.offsetWidth, height: element.offsetHeight }] : []));
    }, [containerRef, showPrintModal, printPageCount, printOptions.pageMode, printOptions.pageRange, style, products]);

    const printDialog: PrintCanvasModalProps | null = showPrintModal ? {
        isOpen: true,
        isPrinting,
        options: printOptions,
        totalPages: printPageCount,
        selectedPages,
        pageChoice: choice,
        onPageChoiceChange: setPageChoice,
        canPrint: chosenIndexes.length > 0,
        previewPages: printPreviewPages,
        onChange: setPrintOptions,
        onPageSetupChange: setup => updateCanvasPageSetup(setStyle, setup, products),
        onClose: () => setShowPrintModal(false),
        async onPrint() {
            setIsPrinting(true);
            onPrintDownloadChange?.(true);
            try {
                const result = await fileExports.configuredPdf(printOptions);
                downloadBlob(result.blob, result.filename);
                setLastCompletedPrintOptions(printOptions);
            } finally {
                setIsPrinting(false);
                onPrintDownloadChange?.(false);
            }
        },
    } : null;
    return { handlePrint, printDialog, fileExports, onPageCountChange: setPrintPageCount };
}
