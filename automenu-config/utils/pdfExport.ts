import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export type PdfPrintOptions = {
  pageMode: 'all' | 'current' | 'range';
  pageRange: string;
  paperSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  marginPreset: '0' | '3' | '5' | '10' | 'custom';
  customMarginMm: number;
  scaleMode: 'fit' | 'actual' | 'custom';
  customScale: number;
  bleedMm: number;
  cropMarks: boolean;
  pageNumbers: boolean;
  printBackgrounds: boolean;
  grayscale: boolean;
  includeCanvasShadow: boolean;
};

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
};

type PdfDebugReporter = (entry: PdfDebugEntry) => void;

type ExportMenuPagesParams = {
  pageElements: HTMLElement[];
  options: PdfPrintOptions;
  currentPageIndex: number | null;
  title: string;
  onDebug?: PdfDebugReporter;
};

const A4_PAGE_MM = { width: 210, height: 297 };
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const EXPORT_CAPTURE_SCALE = 1.5;
const PREVIEW_CAPTURE_SCALE = 0.28;
const TRANSPARENT_PIXEL_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

export const PAPER_SIZES_MM: Record<PdfPrintOptions['paperSize'], { width: number; height: number }> = {
  A4: A4_PAGE_MM,
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
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
  if (!image.complete || image.naturalWidth === 0) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('Falha ao carregar imagem para o PDF.')), { once: true });
    });
  }

  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined);
  }
};

const inlineAsset = async (
  url: string,
  cache: Map<string, string>,
  onDebug?: PdfDebugReporter
) => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) return url;
  if (cache.has(url)) return cache.get(url) || TRANSPARENT_PIXEL_DATA_URL;

  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) return url;

    const response = await waitWithTimeout(
      fetch(url, { mode: 'cors', credentials: 'omit' }),
      12000,
      'Tempo excedido ao carregar imagem externa.'
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const dataUrl = await readBlobAsDataUrl(await response.blob());
    cache.set(url, dataUrl);
    return dataUrl;
  } catch (error) {
    cache.set(url, TRANSPARENT_PIXEL_DATA_URL);
    emitDebug(onDebug, 'warning', 'assets', 'PDF_ASSET_BLOCKED', 'Um recurso externo foi omitido do PDF.', {
      url: safeAssetUrl(url),
      reason: error instanceof Error ? error.message : String(error),
      hint: 'Verifique CORS, URL expirada, permissao do arquivo ou bloqueio de rede.',
    });
    return TRANSPARENT_PIXEL_DATA_URL;
  }
};

const inlineCssUrls = async (
  value: string,
  cache: Map<string, string>,
  onDebug?: PdfDebugReporter
) => {
  const matches = Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g));
  let nextValue = value;
  for (const match of matches) {
    const replacement = await inlineAsset(match[1], cache, onDebug);
    nextValue = nextValue.replace(match[0], `url("${replacement}")`);
  }
  return nextValue;
};

const stripEditorState = (page: HTMLElement) => {
  page.querySelectorAll('button, [data-print-control="true"], .automenu-image-resize-handle').forEach((node) => node.remove());
  page.querySelectorAll<HTMLElement>('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  page.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.classList.remove(
      'ring-4',
      'ring-2',
      'ring-blue-500',
      'ring-indigo-500',
      'bg-indigo-50/10',
      'bg-indigo-50/30'
    );
  });
};

const preparePageClone = async (
  source: HTMLElement,
  printBackgrounds: boolean,
  assetCache: Map<string, string>,
  onDebug?: PdfDebugReporter
) => {
  const sandbox = document.createElement('div');
  sandbox.setAttribute('data-pdf-capture-sandbox', 'true');
  Object.assign(sandbox.style, {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: `${PAGE_WIDTH_PX}px`,
    height: `${PAGE_HEIGHT_PX}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    background: '#ffffff',
    zIndex: '-1',
  });

  const clone = source.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    width: `${PAGE_WIDTH_PX}px`,
    height: `${PAGE_HEIGHT_PX}px`,
    margin: '0',
    transform: 'none',
    boxShadow: 'none',
  });
  clone.classList.remove('ring-4', 'ring-blue-500', 'shadow-2xl');
  stripEditorState(clone);

  if (!printBackgrounds) {
    clone.style.backgroundImage = 'none';
    clone.style.backgroundColor = '#ffffff';
    clone.style.backgroundBlendMode = 'normal';
    clone.querySelectorAll('[data-menu-background-image="true"]').forEach((node) => node.remove());
  }

  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);

  try {
    const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));
    await Promise.all(images.map(async (image) => {
      const sourceUrl = image.currentSrc || image.src;
      image.crossOrigin = 'anonymous';
      image.src = await inlineAsset(sourceUrl, assetCache, onDebug);
      await waitWithTimeout(
        waitForImageReady(image),
        15000,
        'Tempo excedido ao preparar uma imagem para o PDF.'
      );
    }));

    const styledElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    await Promise.all(styledElements.map(async (element) => {
      const computedBackground = window.getComputedStyle(element).backgroundImage;
      if (!computedBackground || computedBackground === 'none') return;
      element.style.backgroundImage = await inlineCssUrls(computedBackground, assetCache, onDebug);
    }));

    await waitWithTimeout(document.fonts?.ready || Promise.resolve(), 5000, 'Tempo excedido ao carregar fontes.').catch((error) => {
      emitDebug(onDebug, 'warning', 'assets', 'PDF_FONT_TIMEOUT', 'As fontes demoraram para carregar; o PDF usara a melhor fonte disponivel.', {
        reason: error instanceof Error ? error.message : String(error),
      });
    });

    return { sandbox, clone };
  } catch (error) {
    sandbox.remove();
    throw error;
  }
};

const convertCanvasToJpeg = (canvas: HTMLCanvasElement, grayscale: boolean, quality: number) => {
  if (!grayscale) return canvas.toDataURL('image/jpeg', quality);

  const filtered = document.createElement('canvas');
  filtered.width = canvas.width;
  filtered.height = canvas.height;
  const context = filtered.getContext('2d');
  if (!context) throw new PdfExportError('PDF_CANVAS_CONTEXT', 'capture', 'O navegador não disponibilizou o contexto do canvas.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, filtered.width, filtered.height);
  context.filter = 'grayscale(100%)';
  context.drawImage(canvas, 0, 0);
  const dataUrl = filtered.toDataURL('image/jpeg', quality);
  filtered.width = 1;
  filtered.height = 1;
  return dataUrl;
};

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

const capturePageAsJpeg = async (
  source: HTMLElement,
  pageNumber: number,
  options: Pick<PdfPrintOptions, 'printBackgrounds' | 'grayscale'>,
  captureScale: number,
  quality: number,
  assetCache: Map<string, string>,
  onDebug?: PdfDebugReporter
) => {
  emitDebug(onDebug, 'info', 'capture', 'PDF_CAPTURE_START', `Capturando página ${pageNumber}.`, {
    scale: captureScale,
    width: PAGE_WIDTH_PX,
    height: PAGE_HEIGHT_PX,
  });

  let sandbox: HTMLDivElement | null = null;
  try {
    const preparedPage = await preparePageClone(source, options.printBackgrounds, assetCache, onDebug);
    sandbox = preparedPage.sandbox;
    const { clone } = preparedPage;
    const canvas = await html2canvas(clone, {
      backgroundColor: '#ffffff',
      scale: captureScale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      removeContainer: true,
      imageTimeout: 15000,
      width: PAGE_WIDTH_PX,
      height: PAGE_HEIGHT_PX,
      windowWidth: PAGE_WIDTH_PX,
      windowHeight: PAGE_HEIGHT_PX,
      scrollX: 0,
      scrollY: 0,
    });

    if (!canvas.width || !canvas.height) {
      throw new PdfExportError('PDF_EMPTY_CANVAS', 'capture', `A captura da página ${pageNumber} ficou vazia.`);
    }

    const dataUrl = convertCanvasToJpeg(canvas, options.grayscale, quality);
    const width = canvas.width;
    const height = canvas.height;
    canvas.width = 1;
    canvas.height = 1;

    if (!dataUrl.startsWith('data:image/jpeg') || dataUrl.length < 100) {
      throw new PdfExportError('PDF_INVALID_IMAGE', 'capture', `A imagem gerada para a página ${pageNumber} é inválida.`);
    }

    emitDebug(onDebug, 'success', 'capture', 'PDF_CAPTURE_OK', `Página ${pageNumber} capturada.`, {
      width,
      height,
      approximateKb: Math.round(dataUrl.length * 0.75 / 1024),
    });
    return dataUrl;
  } catch (error) {
    throw mapCaptureError(error, pageNumber);
  } finally {
    sandbox?.remove();
  }
};

export const getPrintMarginMm = (options: PdfPrintOptions) => (
  options.marginPreset === 'custom' ? Math.max(0, options.customMarginMm) : Number(options.marginPreset)
);

export const getPaperDimensionsMm = (options: PdfPrintOptions) => {
  const source = PAPER_SIZES_MM[options.paperSize];
  return options.orientation === 'landscape'
    ? { width: source.height, height: source.width }
    : { ...source };
};

export const getPrintFrameSizeMm = (
  options: PdfPrintOptions,
  paper: { width: number; height: number },
  marginMm: number
) => {
  const availableWidth = Math.max(1, paper.width - (marginMm * 2));
  const availableHeight = Math.max(1, paper.height - (marginMm * 2));
  const ratio = A4_PAGE_MM.width / A4_PAGE_MM.height;

  if (options.scaleMode === 'actual') return { ...A4_PAGE_MM };
  if (options.scaleMode === 'custom') {
    const scale = Math.max(25, Math.min(200, options.customScale)) / 100;
    return { width: A4_PAGE_MM.width * scale, height: A4_PAGE_MM.height * scale };
  }

  const widthByHeight = availableHeight * ratio;
  return widthByHeight <= availableWidth
    ? { width: widthByHeight, height: availableHeight }
    : { width: availableWidth, height: availableWidth / ratio };
};

export const parsePdfPageRange = (range: string, totalPages: number) => {
  const indexes = new Set<number>();
  range.split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const [startRaw, endRaw] = part.split('-').map((value) => Number(value.trim()));
    if (!Number.isFinite(startRaw)) return;
    const start = Math.max(1, Math.min(totalPages, startRaw));
    const end = Number.isFinite(endRaw) ? Math.max(1, Math.min(totalPages, endRaw)) : start;
    for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) indexes.add(page - 1);
  });
  return indexes;
};

export const resolvePdfPageIndexes = (
  options: PdfPrintOptions,
  totalPages: number,
  currentPageIndex: number | null
) => {
  if (options.pageMode === 'range') return parsePdfPageRange(options.pageRange, totalPages);
  if (options.pageMode === 'current') {
    return currentPageIndex !== null && currentPageIndex >= 0 && currentPageIndex < totalPages
      ? new Set([currentPageIndex])
      : new Set<number>();
  }
  return new Set(Array.from({ length: totalPages }, (_, index) => index));
};

const drawCropMarks = (
  pdf: jsPDF,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number
) => {
  const length = 5;
  const gap = 1.5;
  pdf.setDrawColor(17, 24, 39);
  pdf.setLineWidth(0.2);

  const corners = [
    { x: trimX, y: trimY, sx: -1, sy: -1 },
    { x: trimX + trimWidth, y: trimY, sx: 1, sy: -1 },
    { x: trimX + trimWidth, y: trimY + trimHeight, sx: 1, sy: 1 },
    { x: trimX, y: trimY + trimHeight, sx: -1, sy: 1 },
  ];

  corners.forEach(({ x, y, sx, sy }) => {
    pdf.line(x + (sx * gap), y, x + (sx * (gap + length)), y);
    pdf.line(x, y + (sy * gap), x, y + (sy * (gap + length)));
  });
};

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

export const captureMenuPagePreview = async (
  pageElement: HTMLElement,
  pageNumber: number,
  printBackgrounds: boolean
) => {
  const cache = new Map<string, string>();
  return capturePageAsJpeg(
    pageElement,
    pageNumber,
    { printBackgrounds, grayscale: false },
    PREVIEW_CAPTURE_SCALE,
    0.72,
    cache
  );
};

export const exportMenuPagesToPdf = async ({
  pageElements,
  options,
  currentPageIndex,
  title,
  onDebug,
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

  const paper = getPaperDimensionsMm(options);
  const marginMm = getPrintMarginMm(options);
  const frame = getPrintFrameSizeMm(options, paper, marginMm);
  const bleedMm = Math.max(0, Math.min(10, options.bleedMm || 0));
  const renderWidth = frame.width + (bleedMm * 2);
  const renderHeight = frame.height + (bleedMm * 2);
  const renderX = (paper.width - renderWidth) / 2;
  const renderY = (paper.height - renderHeight) / 2;
  const trimX = renderX + bleedMm;
  const trimY = renderY + bleedMm;
  const assetCache = new Map<string, string>();

  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: [paper.width, paper.height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: title || 'Cardápio',
    subject: 'Cardápio exportado pelo AutoMenu',
    creator: 'AutoMenu',
  });

  for (let outputIndex = 0; outputIndex < pagesToPrint.length; outputIndex += 1) {
    const { element, index } = pagesToPrint[outputIndex];
    if (outputIndex > 0) pdf.addPage([paper.width, paper.height], options.orientation);

    const imageData = await capturePageAsJpeg(
      element,
      index + 1,
      options,
      EXPORT_CAPTURE_SCALE,
      0.9,
      assetCache,
      onDebug
    );

    emitDebug(onDebug, 'info', 'compose', 'PDF_COMPOSE_PAGE', `Montando página ${outputIndex + 1} no PDF.`, {
      sourcePage: index + 1,
      paper,
      frame,
      bleedMm,
    });

    if (options.includeCanvasShadow) {
      pdf.setFillColor(203, 213, 225);
      pdf.roundedRect(renderX + 1.5, renderY + 1.5, renderWidth, renderHeight, 1, 1, 'F');
    }

    pdf.addImage(
      imageData,
      'JPEG',
      renderX,
      renderY,
      renderWidth,
      renderHeight,
      `automenu-page-${outputIndex}`,
      'FAST'
    );

    if (options.cropMarks) drawCropMarks(pdf, trimX, trimY, frame.width, frame.height);
    if (options.pageNumbers) {
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(8);
      pdf.text(
        `Página ${outputIndex + 1} de ${pagesToPrint.length}`,
        paper.width - Math.max(4, marginMm),
        paper.height - Math.max(3, marginMm / 2),
        { align: 'right' }
      );
    }
  }

  emitDebug(onDebug, 'info', 'validate', 'PDF_VALIDATE_START', 'Validando arquivo gerado.');
  let blob: Blob;
  try {
    blob = pdf.output('blob');
  } catch (error) {
    throw new PdfExportError(
      'PDF_SERIALIZATION_FAILED',
      'validate',
      'Falha ao finalizar a estrutura do PDF.',
      { reason: error instanceof Error ? error.message : String(error) },
      error
    );
  }
  await validatePdfBlob(blob);
  emitDebug(onDebug, 'success', 'validate', 'PDF_VALIDATE_OK', 'PDF validado.', { sizeBytes: blob.size });

  const filename = `${sanitizeFileName(title || 'menu')}.pdf`;
  emitDebug(onDebug, 'info', 'download', 'PDF_DOWNLOAD_START', 'Iniciando download.', { filename });
  downloadPdfBlob(blob, filename);

  const result = {
    filename,
    pageCount: pagesToPrint.length,
    sizeBytes: blob.size,
    durationMs: Math.round(performance.now() - startedAt),
  };
  emitDebug(onDebug, 'success', 'complete', 'PDF_EXPORT_OK', 'PDF gerado e enviado ao navegador para download.', result);
  return result;
};
