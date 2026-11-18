export type PdfPrintOptions = {
  pageMode: 'all' | 'current' | 'range';
  pageRange: string;
  paperSize: 'A4' | 'A5' | 'A3' | 'Letter' | 'Square' | 'custom';
  customPaperWidthMm: number;
  customPaperHeightMm: number;
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

export type PdfPageSizePx = {
  width: number;
  height: number;
  widthMm?: number;
  heightMm?: number;
};

const A4_PAGE_MM = { width: 210, height: 297 };

const CSS_PIXELS_PER_INCH = 96;

const MIN_CUSTOM_PAPER_MM = 50;

const MAX_CUSTOM_PAPER_MM = 1000;

export const PAPER_SIZES_MM: Record<Exclude<PdfPrintOptions['paperSize'], 'custom'>, { width: number; height: number }> = {
  A4: A4_PAGE_MM,
  A5: { width: 148, height: 210 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Square: { width: 210, height: 210 },
};

export const getPrintMarginMm = (options: PdfPrintOptions) => (
  options.marginPreset === 'custom' ? Math.max(0, options.customMarginMm) : Number(options.marginPreset)
);

export const getPaperDimensionsMm = (options: PdfPrintOptions) => {
  if (options.paperSize === 'custom') {
    const normalizeCustomDimension = (value: number, defaultValue: number) => (
      Number.isFinite(value)
        ? Math.max(MIN_CUSTOM_PAPER_MM, Math.min(MAX_CUSTOM_PAPER_MM, value))
        : defaultValue
    );
    const firstDimension = normalizeCustomDimension(options.customPaperWidthMm, A4_PAGE_MM.width);
    const secondDimension = normalizeCustomDimension(options.customPaperHeightMm, A4_PAGE_MM.height);
    const source = {
      width: Math.min(firstDimension, secondDimension),
      height: Math.max(firstDimension, secondDimension),
    };
    return options.orientation === 'landscape'
      ? { width: source.height, height: source.width }
      : source;
  }

  const source = PAPER_SIZES_MM[options.paperSize];
  return options.orientation === 'landscape'
    ? { width: source.height, height: source.width }
    : { ...source };
};

export const getPrintFrameSizeMm = (
  options: PdfPrintOptions,
  paper: { width: number; height: number },
  marginMm: number,
  sourceSize?: PdfPageSizePx
) => {
  const availableWidth = Math.max(1, paper.width - (marginMm * 2));
  const availableHeight = Math.max(1, paper.height - (marginMm * 2));
  const sourceFrameMm = sourceSize
    ? {
        width: sourceSize.widthMm || sourceSize.width * 25.4 / CSS_PIXELS_PER_INCH,
        height: sourceSize.heightMm || sourceSize.height * 25.4 / CSS_PIXELS_PER_INCH,
      }
    : A4_PAGE_MM;
  const ratio = sourceFrameMm.width / sourceFrameMm.height;

  if (options.scaleMode === 'actual') return { ...sourceFrameMm };
  if (options.scaleMode === 'custom') {
    const scale = Math.max(25, Math.min(200, options.customScale)) / 100;
    return { width: sourceFrameMm.width * scale, height: sourceFrameMm.height * scale };
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
