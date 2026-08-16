import type { ElementStyle, MenuStyle } from '../types';
import { resolveMenuMargins, resolveMinimumFontSize } from './styleRules';

const MENU_PAGE_WIDTH_PX = 794;

export type WordFitScope =
  | 'menuTitle'
  | 'menuSubtitle'
  | 'category'
  | 'productName'
  | 'productPrice'
  | 'productDescription'
  | 'freeText';

export interface WordFitMeasurement {
  fontSize: number;
  fits: boolean;
}

interface MeasureOptions {
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  textTransform?: ElementStyle['textTransform'];
}

let measurementCanvas: HTMLCanvasElement | null = null;

const transformText = (text: string, transform?: ElementStyle['textTransform']) => {
  if (transform === 'uppercase') return text.toLocaleUpperCase('pt-BR');
  if (transform === 'lowercase') return text.toLocaleLowerCase('pt-BR');
  if (transform === 'capitalize') {
    return text.replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase('pt-BR'));
  }
  return text;
};

const getLongestWordWidth = (
  text: string,
  fontSize: number,
  options: MeasureOptions,
) => {
  const words = transformText(text, options.textTransform).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  if (typeof document === 'undefined') {
    return Math.max(...words.map((word) => word.length)) * fontSize * 0.62;
  }

  measurementCanvas ||= document.createElement('canvas');
  const context = measurementCanvas.getContext('2d');
  if (!context) return Math.max(...words.map((word) => word.length)) * fontSize * 0.62;

  context.font = `${options.fontStyle || 'normal'} ${options.fontWeight || '400'} ${fontSize}px ${options.fontFamily || 'sans-serif'}`;
  const letterSpacing = Number(options.letterSpacing) || 0;
  return Math.max(...words.map((word) => (
    context.measureText(word).width + (Math.max(0, word.length - 1) * letterSpacing)
  )));
};

export const fitTextToUnbrokenWords = (
  text: string,
  availableWidth: number,
  baseFontSize: number,
  minimumFontSize: number,
  allowSameWordBreak: boolean,
  options: MeasureOptions = {},
): WordFitMeasurement => {
  const base = Math.max(minimumFontSize, Number(baseFontSize) || minimumFontSize);
  if (allowSameWordBreak || !text.trim() || availableWidth <= 0) {
    return { fontSize: base, fits: true };
  }

  const safeWidth = Math.max(1, availableWidth - 2);
  const widthAtBase = getLongestWordWidth(text, base, options);
  if (widthAtBase <= safeWidth) return { fontSize: base, fits: true };

  const requiredSize = Math.floor((base * safeWidth) / Math.max(1, widthAtBase));
  const fittedSize = Math.max(minimumFontSize, Math.min(base, requiredSize));
  const widthAtMinimum = getLongestWordWidth(text, minimumFontSize, options);
  return { fontSize: fittedSize, fits: widthAtMinimum <= safeWidth };
};

const getElementAvailableWidth = (element: HTMLElement) => {
  const containerSelector = element.dataset.wordFitContainer;
  if (containerSelector) {
    const container = element.closest<HTMLElement>(containerSelector);
    if (container) return container.clientWidth;
  }

  const mode = element.dataset.wordFitWidthMode;
  const parent = element.parentElement;
  if (!parent || mode === 'self') return element.clientWidth;
  if (mode === 'parent') return parent.clientWidth;

  const computedParent = window.getComputedStyle(parent);
  const gap = Number.parseFloat(computedParent.columnGap || computedParent.gap || '0') || 0;
  const siblings = Array.from(parent.children).filter((child) => child !== element) as HTMLElement[];
  const reservedWidth = siblings.reduce((total, sibling) => {
    const computed = window.getComputedStyle(sibling);
    const flexGrow = Number.parseFloat(computed.flexGrow || '0') || 0;
    if (flexGrow > 0) return total + (Number.parseFloat(computed.minWidth || '0') || 0);
    return total + sibling.offsetWidth;
  }, 0);
  return Math.max(1, parent.clientWidth - reservedWidth - (gap * siblings.length));
};

const readElementOptions = (element: HTMLElement): MeasureOptions => ({
  fontFamily: element.dataset.wordFitFontFamily || window.getComputedStyle(element).fontFamily,
  fontWeight: element.dataset.wordFitFontWeight || window.getComputedStyle(element).fontWeight,
  fontStyle: element.dataset.wordFitFontStyle || window.getComputedStyle(element).fontStyle,
  letterSpacing: Number.parseFloat(element.dataset.wordFitLetterSpacing || '') || 0,
  textTransform: (element.dataset.wordFitTextTransform || 'none') as ElementStyle['textTransform'],
});

export const measureWordFitElement = (
  element: HTMLElement,
  options: { text?: string; baseFontSize?: number; availableWidth?: number } = {},
) => fitTextToUnbrokenWords(
  options.text ?? element.innerText,
  options.availableWidth ?? getElementAvailableWidth(element),
  options.baseFontSize ?? Number(element.dataset.wordFitBaseSize),
  Number(element.dataset.wordFitMinimum) || 10,
  element.dataset.wordFitAllowBreak === 'true',
  readElementOptions(element),
);

const getCanvasWordFitElements = () => Array.from(
  document.querySelectorAll<HTMLElement>('[data-automenu-editor-canvas="true"] [data-word-fit="true"]'),
).filter((element) => element.isConnected && element.getClientRects().length > 0);

export const canIncreaseCanvasFontSize = (
  scope: WordFitScope,
  fontSize: number,
  targetElementId?: string,
) => {
  if (typeof document === 'undefined') return true;
  const elements = getCanvasWordFitElements().filter((element) => (
    element.dataset.wordFitScope === scope
    && (!targetElementId || element.id === targetElementId)
  ));
  return elements.every((element) => {
    if (element.dataset.wordFitAllowBreak === 'true') return true;
    const result = measureWordFitElement(element, { baseFontSize: fontSize });
    return result.fits && result.fontSize >= fontSize;
  });
};

export const canApplyCanvasColumnCounts = (
  style: MenuStyle,
  nextCategoryColumnCount: number,
  nextProductColumnCount: number,
) => {
  if (typeof document === 'undefined' || style.allowSameWordBreak) return true;
  const currentCategoryColumnCount = style.categoryColumnCount || 1;
  const currentProductColumnCount = style.columnCount || 1;
  const margins = resolveMenuMargins(style);
  const usableWidth = MENU_PAGE_WIDTH_PX - margins.left - margins.right;
  const currentCategoryWidth = (usableWidth - (margins.columnGap * (currentCategoryColumnCount - 1))) / currentCategoryColumnCount;
  const nextCategoryWidth = (usableWidth - (margins.columnGap * (nextCategoryColumnCount - 1))) / nextCategoryColumnCount;
  const categoryRatio = nextCategoryWidth / Math.max(1, currentCategoryWidth);
  const productRatio = currentProductColumnCount / Math.max(1, nextProductColumnCount);
  const minimum = resolveMinimumFontSize(style);

  return getCanvasWordFitElements().every((element) => {
    const scope = element.dataset.wordFitScope as WordFitScope;
    if (element.dataset.wordFitAllowBreak === 'true' || scope === 'menuTitle' || scope === 'menuSubtitle') return true;
    const lane = element.closest<HTMLElement>('[data-drag-column-container="category"]');
    const elementCategoryRatio = lane?.clientWidth
      ? nextCategoryWidth / lane.clientWidth
      : categoryRatio;
    const widthRatio = scope === 'category' || scope === 'freeText'
      ? elementCategoryRatio
      : elementCategoryRatio * productRatio;
    const availableWidth = getElementAvailableWidth(element) * widthRatio;
    const result = measureWordFitElement(element, { availableWidth });
    return result.fits && result.fontSize >= minimum;
  });
};

export const canApplyLiveColumnWidths = (
  grid: HTMLElement,
  currentWidths: number[],
  nextWidths: number[],
) => {
  const lanes = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [data-drag-column-container="category"]'));
  return lanes.every((lane) => {
    const columnIndex = Number(lane.dataset.dragColumnIndex || 0);
    const ratio = (nextWidths[columnIndex] || 0) / Math.max(0.0001, currentWidths[columnIndex] || 0);
    return Array.from(lane.querySelectorAll<HTMLElement>('[data-word-fit="true"]')).every((element) => {
      if (element.dataset.wordFitAllowBreak === 'true') return true;
      const result = measureWordFitElement(element, {
        availableWidth: getElementAvailableWidth(element) * ratio,
      });
      return result.fits;
    });
  });
};

export const triggerLimitFeedback = (element: HTMLElement | null | undefined) => {
  if (!element) return;
  element.classList.remove('automenu-limit-feedback');
  void element.offsetWidth;
  element.classList.add('automenu-limit-feedback');
  window.setTimeout(() => element.classList.remove('automenu-limit-feedback'), 850);
};
