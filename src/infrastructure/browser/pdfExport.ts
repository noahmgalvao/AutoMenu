import { getExportGeometry, normalizeExportSettings, type ExportFormat, type ExportPageSize, type ExportSettings } from '../../domain/publishing/exportProfiles';
import { encodeCmykPdfImage, encodeMenuImage, extendPageBleed } from './encodeMenuImage';
import { preparePrintPageContent } from './printPageContent';
import { rasterizePrintPage } from './rasterizePrintPage';
import type { ProfilePdfPage } from './composeMenuPdf';
import { runFileExport } from './runFileExport';

export { getPageElementSizePx } from './printPageContent';

export class PdfExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PdfExportError';
  }
}

const sanitizeFileName = (value: string) => (
  (value || 'menu')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'menu'
);

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
    throw new PdfExportError('PDF_IMAGE_UNAVAILABLE', 'Uma imagem da prévia não pôde ser carregada para exportação.');
  }
  if (typeof image.decode === 'function') await image.decode();
};

type PrintAssetCache = Map<string, Promise<string>>;

const inlineAsset = async (url: string, cache: PrintAssetCache) => {
  if (!url || url.startsWith('data:') || url.startsWith('#')) return url;
  const absoluteUrl = new URL(url, document.baseURI).href;
  const pending = cache.get(absoluteUrl);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(absoluteUrl, { mode: 'cors', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await readBlobAsDataUrl(await response.blob());
    } catch {
      cache.delete(absoluteUrl);
      throw new PdfExportError('PDF_ASSET_BLOCKED', 'Não foi possível carregar uma fonte ou imagem da prévia. Tente exportar novamente.');
    }
  })();
  cache.set(absoluteUrl, request);
  return request;
};

const inlineCssUrls = async (
  value: string,
  cache: PrintAssetCache,
  baseUrl = document.baseURI,
) => {
  const matches = Array.from(value.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g));
  if (!matches.length) return value;
  const urls = await Promise.all(matches.map(match => {
    const url = (match[1] ?? match[2] ?? match[3]).trim();
    if (!url || url.startsWith('data:') || url.startsWith('#')) return url;
    return inlineAsset(new URL(url, baseUrl).href, cache);
  }));
  let nextValue = value;
  matches.forEach((match, index) => { nextValue = nextValue.replace(match[0], () => `url("${urls[index]}")`); });
  return nextValue;
};

const preparePageSnapshot = async (
  clone: HTMLElement,
  pageSize: ExportPageSize,
  assetCache: PrintAssetCache,
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

  Object.assign(clone.style, {
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    margin: '0',
    transform: 'none',
    boxShadow: 'none',
  });
  preparePrintPageContent(clone);

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
      image.src = await inlineAsset(sourceUrl, assetCache);
      await waitWithTimeout(
        waitForImageReady(image),
        15000,
        'Tempo excedido ao preparar uma imagem para o PDF.'
      );
    }));

    try {
      await waitWithTimeout(document.fonts?.ready || Promise.resolve(), 8000, 'Tempo excedido ao carregar fontes.');
    } catch {
      throw new PdfExportError('PDF_FONT_TIMEOUT', 'As fontes da prévia ainda estão carregando. Tente exportar novamente.');
    }

    return { sandbox, clone };
  } catch (error) {
    sandbox.remove();
    throw error;
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

export interface ExportPageSource {
  number: number;
  snapshot: HTMLElement;
  size: ExportPageSize;
}

async function generateProfileFiles(
  pages: ExportPageSource[], format: ExportFormat, options: ExportSettings, title: string,
) {
  if (!pages.length) throw new Error('Selecione pelo menos uma página para gerar o arquivo.');
  const settings = normalizeExportSettings(format, options);
  const assetCache: PrintAssetCache = new Map();
  const files: File[] = [];
  const pdfPages: ProfilePdfPage[] = [];
  const name = sanitizeFileName(title);
  const cmykPdf = format === 'PDF' && settings.color === 'CMYK';
  const readPixels = format === 'TIFF' || cmykPdf;
  let encodedBytes = 0;

  for (const { snapshot, number, size } of pages) {
    const geometry = getExportGeometry(size, settings);
    const { pixelWidth, pixelHeight, trimPixelWidth, trimPixelHeight } = geometry;
    if (Math.max(pixelWidth, pixelHeight) > 16384 || pixelWidth * pixelHeight > 48_000_000) {
      throw new Error(`A página ${number} excede o limite de memória para esta resolução. Escolha uma resolução menor.`);
    }
    await yieldToBrowser();
    let sandbox: HTMLDivElement | undefined;
    let trim: HTMLCanvasElement | undefined;
    let output: HTMLCanvasElement | undefined;
    try {
      const prepared = await preparePageSnapshot(snapshot, size, assetCache);
      sandbox = prepared.sandbox;
      try {
        trim = await rasterizePrintPage(prepared.clone, size.width, size.height,
          (value, baseUrl) => inlineCssUrls(value, assetCache, baseUrl),
          { width: trimPixelWidth, height: trimPixelHeight }, readPixels);
      } catch {
        throw new PdfExportError('PDF_NATIVE_RENDER_UNAVAILABLE',
          `Não foi possível capturar a página ${number} com fidelidade em ${settings.dpi} DPI neste navegador.`);
      }
      sandbox.remove();
      output = extendPageBleed(trim, pixelWidth, pixelHeight, readPixels);
      if (output !== trim) trim.width = trim.height = 1;
      const encoding = format === 'PDF' ? settings.dpi <= 150 ? 'JPG' : 'PNG' : format;
      const image = cmykPdf ? await encodeCmykPdfImage(output)
        : await encodeMenuImage(output, encoding, settings.dpi, format === 'PDF' ? 92 : settings.quality, settings.color);
      encodedBytes += image.size;
      if (encodedBytes > 200_000_000) throw new PdfExportError('PDF_MEMORY_LIMIT',
        'Os arquivos excedem o limite de memória de uma exportação. Exporte menos páginas por vez.');
      if (format === 'PDF') pdfPages.push({ image, pageSize: size });
      else files.push(new File([image], `${name}-pagina-${number}.${format.toLowerCase()}`, { type: image.type }));
    } catch (error) {
      if (error instanceof PdfExportError) throw error;
      throw new Error(`Não foi possível exportar a página ${number} em ${settings.dpi} DPI. ${error instanceof Error ? error.message : ''}`);
    } finally {
      if (output) output.width = output.height = 1;
      if (trim && trim !== output) trim.width = trim.height = 1;
      sandbox?.remove();
    }
  }

  if (format !== 'PDF') return files;
  const pdf = await runFileExport({ kind: 'pdf', pages: pdfPages, settings, title }, async () => {
    const { composeMenuPdf } = await import('./composeMenuPdf');
    return composeMenuPdf(pdfPages, settings, title);
  });
  if (pdf.size < 200 || await pdf.slice(0, 5).text() !== '%PDF-') {
    throw new PdfExportError('PDF_INVALID_SIGNATURE', 'O arquivo gerado não possui uma assinatura PDF válida.');
  }
  return [new File([pdf], `${name}.pdf`, { type: pdf.type })];
}

let exportQueue: Promise<unknown> = Promise.resolve();

export function exportProfileFiles(...args: Parameters<typeof generateProfileFiles>) {
  const task = exportQueue.then(() => generateProfileFiles(...args));
  exportQueue = task.catch(() => undefined);
  return task;
}
