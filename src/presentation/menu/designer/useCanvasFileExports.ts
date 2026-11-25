import { useMemo, type RefObject } from 'react';
import { getPageElementSizePx } from '../../../infrastructure/browser/printPageContent';
import type { ExportPageSize, ExportFormat, ExportSettings } from '../../../domain/publishing/exportProfiles';

export interface CanvasFileExports {
    pageSizes: () => ExportPageSize[];
    generate: (format: ExportFormat, settings: ExportSettings, indexes: readonly number[]) => Promise<File[]>;
}

export function useCanvasFileExports(containerRef: RefObject<HTMLDivElement | null>, title: string): CanvasFileExports {
    return useMemo(() => {
        const pages = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]') || []);
        return {
            pageSizes: () => pages().map(getPageElementSizePx),
            async generate(format, settings, indexes) {
                const elements = pages();
                // Take a snapshot before yielding so closing the dialog or editing cannot change the output.
                const snapshots = [...new Set(indexes)].sort((a, b) => a - b).map(index => {
                    const page = elements[index];
                    if (!page) throw new Error(`A página ${index + 1} ainda não está disponível para exportação.`);
                    return { number: index + 1, size: getPageElementSizePx(page), snapshot: page.cloneNode(true) as HTMLElement };
                });
                const { exportProfileFiles } = await import('../../../infrastructure/browser/pdfExport');
                return exportProfileFiles(snapshots, format, settings, title || 'Cardápio');
            },
        };
    }, [containerRef, title]);
}
