import { useMemo, type RefObject } from 'react';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import type { PdfExportResult, PrintCaptureCache } from '../../../infrastructure/browser/pdfExport';
import type { PrintCanvasOptions } from './PrintCanvasModal';

export interface CanvasFileExports {
    pdf: () => PdfExportResult | Promise<PdfExportResult>;
    publicationPdf: () => PdfExportResult | Promise<PdfExportResult>;
    jpg: (indexes: readonly number[]) => File[] | Promise<File[]>;
}

export function useCanvasFileExports(
    containerRef: RefObject<HTMLDivElement | null>,
    style: MenuStyle,
    products: Product[],
    sortOption: SortOption,
    options: PrintCanvasOptions,
    publicationOptions: PrintCanvasOptions,
    pageCount: number,
): CanvasFileExports & { configuredPdf: (options: PrintCanvasOptions) => PdfExportResult | Promise<PdfExportResult> } {
    const captures = useMemo(() => {
        const pages = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []);
        const title = style.menuTitle || 'Cardápio';
        const cache: PrintCaptureCache = { assets: new Map(), pages: new WeakMap() };
        const pdfResults = new Map<string, PdfExportResult | Promise<PdfExportResult>>();
        const jpgResults = new Map<number, File>();
        const jpgTasks = new Map<number, Promise<File>>();

        // Share captures across formats while retaining a ready file for the share sheet.
        const configuredPdf = (printOptions: PrintCanvasOptions) => {
            const key = JSON.stringify(printOptions);
            const ready = pdfResults.get(key);
            if (ready) return ready;
            const pageElements = pages();
            const pending = import('../../../infrastructure/browser/pdfExport').then(async ({ exportMenuPagesToPdf }) => {
                const result = await exportMenuPagesToPdf({
                    pageElements, options: printOptions, currentPageIndex: null, title, download: false, captureCache: cache,
                });
                pdfResults.set(key, result);
                if (pdfResults.size > 4) {
                    const oldest = [...pdfResults].find(([cachedKey, value]) => cachedKey !== key && !(value instanceof Promise));
                    if (oldest) pdfResults.delete(oldest[0]);
                }
                return result;
            }).catch(error => {
                pdfResults.delete(key);
                throw error;
            });
            pdfResults.set(key, pending);
            return pending;
        };

        const jpg = (indexes: readonly number[]) => {
            if (!indexes.length) throw new Error('Selecione pelo menos uma página para gerar JPG.');
            if (indexes.every(index => jpgResults.has(index))) return indexes.map(index => jpgResults.get(index)!);
            const pageElements = pages();
            return Promise.all(indexes.map(index => {
                const result = jpgResults.get(index);
                if (result) return result;
                const pending = jpgTasks.get(index);
                if (pending) return pending;
                const task = import('../../../infrastructure/browser/pdfExport').then(async ({ exportMenuPageToJpg }) => {
                    const page = pageElements[index];
                    if (!page) throw new Error(`A página ${index + 1} não está disponível para exportação.`);
                    const file = await exportMenuPageToJpg(page, index + 1, title, cache.assets, cache);
                    jpgResults.set(index, file);
                    return file;
                }).finally(() => { jpgTasks.delete(index); });
                jpgTasks.set(index, task);
                return task;
            }));
        };

        return { configuredPdf, jpg };
    }, [containerRef, style, products, sortOption, pageCount]);
    return useMemo(() => ({
        ...captures,
        pdf: () => captures.configuredPdf(options),
        publicationPdf: () => captures.configuredPdf(publicationOptions),
    }), [captures, options, publicationOptions]);
}
