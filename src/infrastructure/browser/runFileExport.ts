import type { ExportSettings } from '../../domain/publishing/exportProfiles';
import type { ProfilePdfPage } from './composeMenuPdf';

export type FileExportRequest =
  | { kind: 'pdf'; pages: ProfilePdfPage[]; settings: ExportSettings; title: string }
  | { kind: 'images-zip'; files: File[] };

export type FileExportReply = { blob: Blob } | { error: string };

export async function runFileExport(request: FileExportRequest, fallback: () => Promise<Blob>) {
  if (typeof Worker === 'undefined') return fallback();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./fileExport.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return fallback();
  }

  try {
    const reply = await new Promise<FileExportReply | null>((resolve, reject) => {
      worker.addEventListener('message', (event: MessageEvent<FileExportReply>) => resolve(event.data), { once: true });
      worker.addEventListener('error', () => resolve(null), { once: true });
      worker.addEventListener('messageerror', () => reject(new Error('O navegador não recebeu o arquivo exportado.')), { once: true });
      worker.postMessage(request);
    });
    if (!reply) return fallback();
    if ('error' in reply) throw new Error(reply.error);
    return reply.blob;
  } finally {
    worker.terminate();
  }
}
