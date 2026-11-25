import type { FileExportReply, FileExportRequest } from './runFileExport';

globalThis.addEventListener('message', async (event: MessageEvent<FileExportRequest>) => {
  const request = event.data;
  let reply: FileExportReply;
  try {
    if (request.kind === 'pdf') {
      const { composeMenuPdf } = await import('./composeMenuPdf');
      reply = { blob: await composeMenuPdf(request.pages, request.settings, request.title) };
    } else {
      const { zipImageFiles } = await import('./zipImageFiles');
      reply = { blob: await zipImageFiles(request.files) };
    }
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  globalThis.postMessage(reply);
});
