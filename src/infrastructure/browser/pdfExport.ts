import { preparePrintPageContent } from './printPageContent';
import {
  type PdfPrintOptions,
  type PdfPageSizePx,
  resolvePdfPageIndexes,
} from '../../domain/publishing/printOptions';
import { rasterizePrintPage } from './rasterizePrintPage';
import type { PdfPageImage } from './composeMenuPdf';
import { runFileExport } from './runFileExport';

export type PdfDebugLevel = 'info' | 'warning' | 'error' | 'success';

export type PdfDebugStage = 'prepare' | 'assets' | 'capture' | 'compose' | 'validate' | 'download' | 'complete';

export type PdfDebugEntry = {
  timestamp: string;
  level: PdfDebugLevel;
  stage: PdfDebugStage;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type PdfExportResult = {
  filename: string;
  pageCount: number;
  sizeBytes: number;
  durationMs: number;
  blob: Blob;
};

type PdfDebugReporter = (entry: PdfDebugEntry) => void;

type ExportMenuPagesParams = {
  pageElements: HTMLElement[];
  options: PdfPrintOptions;
  currentPageIndex: number | null;
  title: string;
  onDebug?: PdfDebugReporter;
  download?: boolean;
};

const PAGE_WIDTH_PX = 794;

const PAGE_HEIGHT_PX = 1123;

const PRINT_PIXELS_PER_CSS_PIXEL = 300 / 96;
const MAX_EXPORT_PIXELS = 16_000_000;
const MAX_EXPORT_DIMENSION = 8192;
const EXPORT_JPEG_QUALITY = 1;

const getCaptureScale = ({ width, height }: PdfPageSizePx) => Math.min(
  PRINT_PIXELS_PER_CSS_PIXEL, Math.sqrt(MAX_EXPORT_PIXELS / (width * height)),
  MAX_EXPORT_DIMENSION / Math.max(width, height),
);

const normalizePageDimension = (value: number) => (
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0
);

const normalizePhysicalDimension = (value: number) => (
  Number.isFinite(value) && value > 0 ? value : undefined
);

export const getPageElementSizePx = (element: HTMLElement): PdfPageSizePx => {
  const computedStyle = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const width = [
    Number(element.dataset.menuPageWidthPx),
    element.offsetWidth,
    element.clientWidth,
    Number.parseFloat(computedStyle.width),
    Number.parseFloat(element.style.width),
    rect.width,
  ].map(normalizePageDimension).find(Boolean) || PAGE_WIDTH_PX;
  const height = [
    Number(element.dataset.menuPageHeightPx),
    element.offsetHeight,
    element.clientHeight,
    Number.parseFloat(computedStyle.height),
    Number.parseFloat(element.style.height),
    rect.height,
  ].map(normalizePageDimension).find(Boolean) || PAGE_HEIGHT_PX;

  const widthMm = normalizePhysicalDimension(Number(element.dataset.menuPageWidthMm));
  const heightMm = normalizePhysicalDimension(Number(element.dataset.menuPageHeightMm));

  return { width, height, widthMm, heightMm };
};

export class PdfExportError extends Error {
  code: string;
  stage: PdfDebugStage;
  details?: Record<string, unknown>;

  constructor(code: string, stage: PdfDebugStage, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(message);
    this.name = 'PdfExportError';
    this.code = code;
    this.stage = stage;
    this.details = details;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

const createDebugEntry = (
  level: PdfDebugLevel,
  stage: PdfDebugStage,
  code: string,
  message: string,
  details?: Record<string, unknown>
): PdfDebugEntry => ({
  timestamp: new Date().toISOString(),
  level,
  stage,
  code,
  message,
  details,
});

const emitDebug = (
  reporter: PdfDebugReporter | undefined,
  level: PdfDebugLevel,
  stage: PdfDebugStage,
  code: string,
  message: string,
  details?: Record<string, unknown>
) => {
  const entry = createDebugEntry(level, stage, code, message, details);
  reporter?.(entry);
  const consoleMethod = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
  consoleMethod(`[PDF][${stage}][${code}] ${message}`, details || '');
};

const sanitizeFileName = (value: string) => (
  (value || 'menu')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'menu'
);

const safeAssetUrl = (value: string) => {
  if (!value || value.startsWith('data:')) return value ? 'data-url' : 'sem-url';
  try {
    const url = new URL(value, window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.slice(0, 160);
  }
};

const readBlobAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Falha ao ler recurso como data URL.'));
  reader.readAsDataURL(blob);
});

const waitWithTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) => {
  let timeoutId = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const waitForImageReady = async (image: HTMLImageElement) => {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('Falha ao carregar imagem para o PDF.')), { once: true });
    });
  }

  if (!image.naturalWidth) {
    throw new PdfExportError('PDF_IMAGE_UNAVAILABLE', 'assets', 'Uma imagem da prévia não pôde ser carregada para exportação.');
  }
  if (typeof image.decode === 'function') await image.decode();
};

export type PrintAssetCache = Map<string, Promise<string>>;

const inlineAsset = async (url: string, cache: PrintAssetCache, onDebug?: PdfDebugReporter) => {
  if (!url || url.startsWith('data:') || url.startsWith('#')) return url;
  const absoluteUrl = new URL(url, document.baseURI).href;
  const pending = cache.get(absoluteUrl);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(absoluteUrl, { mode: 'cors', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await readBlobAsDataUrl(await response.blob());
    } catch (error) {
      cache.delete(absoluteUrl);
      const details = { url: safeAssetUrl(absoluteUrl), reason: error instanceof Error ? error.message : String(error) };
      emitDebug(onDebug, 'error', 'assets', 'PDF_ASSET_BLOCKED', 'Um recurso da prévia não pôde ser carregado para exportação.', details);
      throw new PdfExportError('PDF_ASSET_BLOCKED', 'assets',
        'Não foi possível carregar uma fonte ou imagem da prévia. Tente exportar novamente.', details, error);
    }
  })();
  cache.set(absoluteUrl, request);
  return request;
};

const inlineCssUrls = async (
  value: string,
  cache: PrintAssetCache,
  onDebug?: PdfDebugReporter,
  baseUrl = document.baseURI,
) => {
  const matches = Array.from(value.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g));
  if (!matches.length) return value;
  const urls = await Promise.all(matches.map(match => {
    const url = (match[1] ?? match[2] ?? match[3]).trim();
    if (!url || url.startsWith('data:') || url.startsWith('#')) return url;
    return inlineAsset(new URL(url, baseUrl).href, cache, onDebug);
  }));
  let nextValue = value;
  matches.forEach((match, index) => { nextValue = nextValue.replace(match[0], () => `url("${urls[index]}")`); });
  return nextValue;
};

const preparePageClone = async (
  source: HTMLElement,
  pageSize: PdfPageSizePx,
  printBackgrounds: boolean,
  assetCache: PrintAssetCache,
  onDebug?: PdfDebugReporter
) => {
  const sandbox = document.createElement('div');
  sandbox.setAttribute('data-pdf-capture-sandbox', 'true');
  Object.assign(sandbox.style, {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    background: '#ffffff',
    zIndex: '-1',
  });

  const clone = source.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    margin: '0',
    transform: 'none',
    boxShadow: 'none',
  });
  preparePrintPageContent(clone, printBackgrounds);

  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);

  try {
    const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(async (image) => {
      const sourceUrl = image.currentSrc || image.src;
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.removeAttribute('crossorigin');
      if (!sourceUrl) return;
      image.src = await inlineAsset(sourceUrl, assetCache, onDebug);
      await waitWithTimeout(
        waitForImageReady(image),
        15000,
        'Tempo excedido ao preparar uma imagem para o PDF.'
      );
    }));

    try {
      await waitWithTimeout(document.fonts?.ready || Promise.resolve(), 8000, 'Tempo excedido ao carregar fontes.');
    } catch (error) {
      throw new PdfExportError('PDF_FONT_TIMEOUT', 'assets', 'As fontes da prévia ainda estão carregando. Tente exportar novamente.', undefined, error);
    }

    return { sandbox, clone };
  } catch (error) {
    sandbox.remove();
    throw error;
  }
};

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => {
    if (blob?.type === 'image/jpeg' && blob.size >= 100) resolve(blob);
    else reject(new PdfExportError('PDF_INVALID_IMAGE', 'capture', 'A imagem gerada para a página é inválida.'));
  }, 'image/jpeg', quality);
});

const convertCanvasToJpeg = async (canvas: HTMLCanvasElement, grayscale: boolean, quality: number) => {
  if (!grayscale) return encodeJpeg(canvas, quality);
  const filtered = document.createElement('canvas');
  filtered.width = canvas.width;
  filtered.height = canvas.height;
  try {
    const context = filtered.getContext('2d');
    if (!context) throw new PdfExportError('PDF_CANVAS_CONTEXT', 'capture', 'O navegador não disponibilizou o contexto do canvas.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, filtered.width, filtered.height);
    context.filter = 'grayscale(100%)';
    context.drawImage(canvas, 0, 0);
    return await encodeJpeg(filtered, quality);
  } finally {
    filtered.width = filtered.height = 1;
  }
};

const yieldToBrowser = () => new Promise<void>(resolve => {
  // Allow rendering and input before each capture, even if the user switches tabs.
  const fallback = window.setTimeout(() => {
    window.cancelAnimationFrame(frame);
    resolve();
  }, 50);
  const frame = window.requestAnimationFrame(() => {
    window.clearTimeout(fallback);
    window.setTimeout(resolve, 0);
  });
});

const mapCaptureError = (error: unknown, pageNumber: number) => {
  if (error instanceof PdfExportError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (error instanceof DOMException && error.name === 'SecurityError') {
    return new PdfExportError(
      'PDF_CANVAS_SECURITY',
      'capture',
      `A página ${pageNumber} contém uma imagem bloqueada pelo navegador.`,
      { hint: 'Verifique CORS e permissoes das imagens externas.' },
      error
    );
  }
  if (error instanceof RangeError || lowerMessage.includes('memory') || lowerMessage.includes('allocation')) {
    return new PdfExportError(
      'PDF_MEMORY_LIMIT',
      'capture',
      `A memória do navegador acabou ao processar a página ${pageNumber}.`,
      { hint: 'Feche outras abas, reduza imagens muito grandes ou exporte menos páginas por vez.' },
      error
    );
  }

  return new PdfExportError(
    'PDF_CAPTURE_FAILED',
    'capture',
    `Falha ao capturar a página ${pageNumber}.`,
    { reason: message },
    error
  );
};

const renderPageAsJpeg = async (
  source: HTMLElement,
  pageNumber: number,
  options: Pick<PdfPrintOptions, 'printBackgrounds' | 'grayscale'>,
  assetCache: PrintAssetCache,
  onDebug?: PdfDebugReporter
) => {
  await yieldToBrowser();
  const pageSize = getPageElementSizePx(source);
  const captureScale = getCaptureScale(pageSize);
  emitDebug(onDebug, 'info', 'capture', 'PDF_CAPTURE_START', `Capturando página ${pageNumber}.`, {
    scale: captureScale,
    width: pageSize.width,
    height: pageSize.height,
  });

  let sandbox: HTMLDivElement | null = null;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const preparedPage = await preparePageClone(source, pageSize, options.printBackgrounds, assetCache, onDebug);
    sandbox = preparedPage.sandbox;
    const { clone } = preparedPage;
    try {
      canvas = await rasterizePrintPage(clone, pageSize.width, pageSize.height, captureScale,
        (value, baseUrl) => inlineCssUrls(value, assetCache, onDebug, baseUrl));
    } catch (error) {
      if (error instanceof PdfExportError) throw error;
      throw new PdfExportError('PDF_NATIVE_RENDER_UNAVAILABLE', 'capture',
        'Não foi possível capturar a prévia com fidelidade neste navegador.',
        { reason: error instanceof Error ? error.message : String(error) }, error);
    }

    if (!canvas.width || !canvas.height) {
      throw new PdfExportError('PDF_EMPTY_CANVAS', 'capture', `A captura da página ${pageNumber} ficou vazia.`);
    }

    const jpeg = await convertCanvasToJpeg(canvas, options.grayscale, EXPORT_JPEG_QUALITY);
    emitDebug(onDebug, 'success', 'capture', 'PDF_CAPTURE_OK', `Página ${pageNumber} capturada.`, {
      width: canvas.width,
      height: canvas.height,
      approximateKb: Math.round(jpeg.size / 1024),
    });
    return { jpeg, pageSize };
  } catch (error) {
    throw mapCaptureError(error, pageNumber);
  } finally {
    if (canvas) canvas.width = canvas.height = 1;
    sandbox?.remove();
  }
};

let captureQueue: Promise<unknown> = Promise.resolve();
function capturePageAsJpeg(...args: Parameters<typeof renderPageAsJpeg>) {
  const capture = captureQueue.then(() => renderPageAsJpeg(...args));
  captureQueue = capture.catch(() => undefined);
  return capture;
}

const validatePdfBlob = async (blob: Blob) => {
  if (blob.size < 200) {
    throw new PdfExportError('PDF_EMPTY_FILE', 'validate', 'O PDF gerado ficou vazio.', { sizeBytes: blob.size });
  }
  const signature = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (signature !== '%PDF-') {
    throw new PdfExportError('PDF_INVALID_SIGNATURE', 'validate', 'O arquivo gerado não possui uma assinatura PDF válida.', { signature });
  }
};

const downloadPdfBlob = (blob: Blob, filename: string) => {
  const legacyNavigator = navigator as Navigator & { msSaveOrOpenBlob?: (data: Blob, name: string) => boolean };
  if (legacyNavigator.msSaveOrOpenBlob) {
    legacyNavigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);

  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new PdfExportError(
      'PDF_DOWNLOAD_BLOCKED',
      'download',
      'O navegador bloqueou o inicio do download.',
      { hint: 'Permita downloads para este site e tente novamente.' },
      error
    );
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
};

export async function exportMenuPageToJpg(
  element: HTMLElement,
  pageNumber: number,
  title: string,
  assetCache: PrintAssetCache,
) {
  const { jpeg } = await capturePageAsJpeg(
    element, pageNumber, { printBackgrounds: true, grayscale: false }, assetCache,
  );
  return new File([jpeg], `${sanitizeFileName(title)}-pagina-${pageNumber}.jpg`, { type: 'image/jpeg' });
}

export const exportMenuPagesToPdf = async ({
  pageElements,
  options,
  currentPageIndex,
  title,
  onDebug,
  download = true,
}: ExportMenuPagesParams): Promise<PdfExportResult> => {
  const startedAt = performance.now();
  const selectedIndexes = resolvePdfPageIndexes(options, pageElements.length, currentPageIndex);
  const pagesToPrint = pageElements
    .map((element, index) => ({ element, index }))
    .filter(({ index }) => selectedIndexes.has(index));

  emitDebug(onDebug, 'info', 'prepare', 'PDF_EXPORT_START', 'Exportacao iniciada.', {
    availablePages: pageElements.length,
    selectedPages: pagesToPrint.map(({ index }) => index + 1),
    browser: navigator.userAgent,
    options,
  });

  if (pageElements.length === 0) {
    throw new PdfExportError('PDF_NO_PAGES', 'prepare', 'Nenhuma página do cardápio foi encontrada.');
  }
  if (pagesToPrint.length === 0) {
    throw new PdfExportError(
      'PDF_INVALID_PAGE_SELECTION',
      'prepare',
      'Nenhuma página válida foi selecionada para exportação.',
      { pageMode: options.pageMode, pageRange: options.pageRange, currentPageIndex }
    );
  }

  const assetCache: PrintAssetCache = new Map();
  const pages: PdfPageImage[] = [];
  for (const { element, index } of pagesToPrint) {
    pages.push(await capturePageAsJpeg(element, index + 1, options, assetCache, onDebug));
  }

  emitDebug(onDebug, 'info', 'compose', 'PDF_COMPOSE_START', 'Montando o PDF.', { pages: pages.length });
  let blob: Blob;
  try {
    blob = await runFileExport({ kind: 'pdf', pages, options, title }, async () => {
      await yieldToBrowser();
      const { composeMenuPdf } = await import('./composeMenuPdf');
      return composeMenuPdf(pages, options, title);
    });
  } catch (error) {
    throw new PdfExportError(
      'PDF_SERIALIZATION_FAILED',
      'validate',
      'Falha ao finalizar a estrutura do PDF.',
      { reason: error instanceof Error ? error.message : String(error) },
      error
    );
  }
  emitDebug(onDebug, 'info', 'validate', 'PDF_VALIDATE_START', 'Validando arquivo gerado.');
  await validatePdfBlob(blob);
  emitDebug(onDebug, 'success', 'validate', 'PDF_VALIDATE_OK', 'PDF validado.', { sizeBytes: blob.size });

  const filename = `${sanitizeFileName(title || 'menu')}.pdf`;
  if (download) {
    emitDebug(onDebug, 'info', 'download', 'PDF_DOWNLOAD_START', 'Iniciando download.', { filename });
    downloadPdfBlob(blob, filename);
  }

  const result = {
    filename,
    pageCount: pagesToPrint.length,
    sizeBytes: blob.size,
    durationMs: Math.round(performance.now() - startedAt),
    blob,
  };
  emitDebug(onDebug, 'success', 'complete', 'PDF_EXPORT_OK', download ? 'PDF gerado e enviado ao navegador para download.' : 'PDF gerado.', {
    filename: result.filename,
    pageCount: result.pageCount,
    sizeBytes: result.sizeBytes,
    durationMs: result.durationMs,
  });
  return result;
};
