import type { FileExportReply, FileExportRequest } from './runFileExport';

globalThis.addEventListener('message', async (event: MessageEvent<FileExportRequest>) => {
  const request = event.data;
  let reply: FileExportReply;
  try {
    if (request.kind === 'pdf') {
      const { composeMenuPdf } = await import('./composeMenuPdf');
      reply = { blob: await composeMenuPdf(request.pages, request.options, request.title) };
    } else {
      const { zipJpgFiles } = await import('./zipJpgFiles');
      reply = { blob: await zipJpgFiles(request.files) };
    }
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  globalThis.postMessage(reply);
});
