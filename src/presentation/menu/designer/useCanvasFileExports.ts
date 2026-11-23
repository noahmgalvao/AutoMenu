import { useMemo, type RefObject } from 'react';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import type { PdfExportResult } from '../../../infrastructure/browser/pdfExport';
import type { PrintCanvasOptions } from './PrintCanvasModal';

export interface CanvasFileExports {
    pdf: () => PdfExportResult | Promise<PdfExportResult>;
    jpg: (indexes: readonly number[]) => File[] | Promise<File[]>;
}

export function useCanvasFileExports(
    containerRef: RefObject<HTMLDivElement | null>,
    style: MenuStyle,
    products: Product[],
    sortOption: SortOption,
    options: PrintCanvasOptions,
    pageCount: number,
): CanvasFileExports {
    return useMemo(() => {
        const pages = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []);
        const title = style.menuTitle || 'Cardápio';
        let queue: Promise<unknown> = Promise.resolve();
        let pdfResult: PdfExportResult | undefined;
        let pdfTask: Promise<PdfExportResult> | undefined;
        const jpgResults = new Map<number, File>();
        const jpgTasks = new Map<number, Promise<File>>();
        const assetCache = new Map<string, string>();

        // Reuse ready files so the share sheet can open within the original tap.
        const pdf = () => {
            if (pdfResult) return pdfResult;
            if (pdfTask) return pdfTask;
            const pageElements = pages();
            pdfTask = queue.then(async () => {
                const { exportMenuPagesToPdf } = await import('../../../infrastructure/browser/pdfExport');
                pdfResult = await exportMenuPagesToPdf({ pageElements, options, currentPageIndex: null, title, download: false });
                return pdfResult;
            }).finally(() => { pdfTask = undefined; });
            queue = pdfTask.catch(() => undefined);
            return pdfTask;
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
                const task = queue.then(async () => {
                    const page = pageElements[index];
                    if (!page) throw new Error(`A página ${index + 1} não está disponível para exportação.`);
                    const { exportMenuPageToJpg } = await import('../../../infrastructure/browser/pdfExport');
                    const file = await exportMenuPageToJpg(page, index + 1, title, assetCache);
                    jpgResults.set(index, file);
                    return file;
                }).finally(() => { jpgTasks.delete(index); });
                jpgTasks.set(index, task);
                queue = task.catch(() => undefined);
                return task;
            }));
        };

        return { pdf, jpg };
    }, [containerRef, style, products, sortOption, options, pageCount]);
}
