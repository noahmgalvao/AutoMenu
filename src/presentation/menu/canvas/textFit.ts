import { getProductGridGap } from '../../../domain/menu/menuPagination';
import { getProductColumnCount } from '../../../domain/menu/categoryColumns';
import type { ElementStyle, MenuStyle } from '../../../domain/menu/model';
import { DEFAULT_MINIMUM_FONT_SIZE } from '../../../domain/menu/defaults';
import { resolveMenuMargins, resolveMinimumFontSize } from '../../../domain/menu/styleRules';
import { normalizeColumnWidths } from '../../../domain/menu/categoryColumns';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';

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

const measureTextWidths = (
  parts: string[],
  fontSize: number,
  options: MeasureOptions,
) => {
  if (parts.length === 0) return 0;

  if (typeof document === 'undefined') {
    return Math.max(...parts.map(part => part.length)) * fontSize * 0.62;
  }

  measurementCanvas ||= document.createElement('canvas');
  const context = measurementCanvas.getContext('2d');
  if (!context) return Math.max(...parts.map(part => part.length)) * fontSize * 0.62;

  context.font = `${options.fontStyle || 'normal'} ${options.fontWeight || '400'} ${fontSize}px ${options.fontFamily || 'sans-serif'}`;
  const letterSpacing = Number(options.letterSpacing) || 0;
  return Math.max(...parts.map(part => (
    context.measureText(part).width + (Math.max(0, part.length - 1) * letterSpacing)
  )));
};

const getLongestWordWidth = (text: string, fontSize: number, options: MeasureOptions) =>
  measureTextWidths(transformText(text, options.textTransform).split(/\s+/).filter(Boolean), fontSize, options);

export const measureRenderedText = (text: string, fontSize: number, css: CSSStyleDeclaration) =>
  measureTextWidths(transformText(text.trim(), css.textTransform as ElementStyle['textTransform'])
    .split('\n').map(line => line.replace(/\s+/g, ' ')), fontSize, {
    fontFamily: css.fontFamily,
    fontWeight: css.fontWeight,
    fontStyle: css.fontStyle,
    letterSpacing: parseFloat(css.letterSpacing),
  });

export const fitTextToUnbrokenWords = (
  text: string,
  availableWidth: number,
  baseFontSize: number,
  minimumFontSize: number,
  options: MeasureOptions = {},
): WordFitMeasurement => {
  const minimum = Math.max(1, Number(minimumFontSize) || DEFAULT_MINIMUM_FONT_SIZE);
  const base = Math.max(minimum, Number(baseFontSize) || minimum);
  if (!text.trim() || availableWidth <= 0) {
    return { fontSize: base, fits: true };
  }

  const safeWidth = Math.max(1, availableWidth);
  if (getLongestWordWidth(text, base, options) <= safeWidth) return { fontSize: base, fits: true };
  if (getLongestWordWidth(text, minimum, options) > safeWidth) return { fontSize: minimum, fits: false };

  let low = minimum;
  let high = Math.floor(base);
  while (high - low >= 1) {
    const candidate = Math.ceil((low + high) / 2);
    if (getLongestWordWidth(text, candidate, options) <= safeWidth) low = candidate;
    else high = candidate - 1;
  }
  return { fontSize: low, fits: true };
};

export const getWordFitWidthContainer = (element: HTMLElement) => {
  const selector = element.dataset.wordFitContainer;
  const explicitContainer = selector && element.closest<HTMLElement>(selector);
  if (explicitContainer) return explicitContainer;
  return element.dataset.wordFitWidthMode === 'self' ? element : element.parentElement || element;
};

export const getElementAvailableWidth = (element: HTMLElement) => {
  const widthInset = Math.max(0, Number(element.dataset.wordFitWidthInset) || 0);
  const container = getWordFitWidthContainer(element);
  const computed = getComputedStyle(container);
  const width = container.clientWidth - (parseFloat(computed.paddingLeft) || 0) - (parseFloat(computed.paddingRight) || 0);
  const mode = element.dataset.wordFitWidthMode;
  const parent = element.parentElement;
  if (!parent || mode !== 'flex') return width > 0 ? Math.max(1, width - widthInset) : 0;

  const computedParent = window.getComputedStyle(parent);
  const gap = Number.parseFloat(computedParent.columnGap || computedParent.gap || '0') || 0;
  const reservedWidth = Array.from(parent.children).reduce((total, child) => {
    if (!(child instanceof HTMLElement) || child === element || child.hidden) return total;
    const sibling = getComputedStyle(child);
    if (sibling.display === 'none' || sibling.position === 'absolute' || sibling.position === 'fixed') return total;
    const flexGrow = parseFloat(sibling.flexGrow) || 0;
    const size = flexGrow > 0 ? parseFloat(sibling.minWidth) || 0 : child.offsetWidth;
    return total + size + gap + (parseFloat(sibling.marginLeft) || 0) + (parseFloat(sibling.marginRight) || 0);
  }, 0);
  return width > 0 ? Math.max(1, width - widthInset - reservedWidth) : 0;
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
  Number(element.dataset.wordFitMinimum) || DEFAULT_MINIMUM_FONT_SIZE,
  readElementOptions(element),
);

export const getLargestSafeFontSizeForElements = (
  elements: HTMLElement[],
  maximumFontSize: number,
  minimumFontSize: number,
) => {
  const maximum = Math.max(minimumFontSize, Math.floor(Number(maximumFontSize) || minimumFontSize));
  const minimum = Math.max(1, Math.ceil(Number(minimumFontSize) || DEFAULT_MINIMUM_FONT_SIZE));

  return elements.reduce((size, element) => Math.max(minimum,
    Math.min(size, measureWordFitElement(element, { baseFontSize: size }).fontSize)), maximum);
};

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
    const result = measureWordFitElement(element, { baseFontSize: fontSize });
    return result.fits && result.fontSize >= fontSize;
  });
};

export const canApplyCanvasColumnCounts = (
  style: MenuStyle,
  nextCategoryColumnCount: number,
  nextProductColumnCount?: number,
  selectedCategory?: string,
  targetStyle = style,
) => {
  if (typeof document === 'undefined') return true;
  const currentCategoryCount = style.categoryColumnCount || 1;
  const margins = resolveMenuMargins(targetStyle);
  const usableWidth = resolveMenuPageDimensions(targetStyle).widthPx - margins.left - margins.right;
  const categoryContentWidth = usableWidth - margins.columnGap * (nextCategoryColumnCount - 1);
  const ratios = normalizeColumnWidths(
    nextCategoryColumnCount === currentCategoryCount ? style.categoryColumnWidths : undefined,
    nextCategoryColumnCount,
  );

  const elements = [...getCanvasWordFitElements(), ...document.querySelectorAll<HTMLElement>(
    '[data-automenu-editor-canvas="true"] [data-template-price]',
  )];
  return elements.every(element => {
    const scope = element.dataset.wordFitScope as WordFitScope;
    if (scope === 'menuTitle' || scope === 'menuSubtitle') return true;
    const lane = element.closest<HTMLElement>('[data-drag-column-container="category"]');
    const chunk = element.closest<HTMLElement>('[data-category-chunk]');
    const category = chunk?.dataset.categoryChunk;
    if (selectedCategory && category !== selectedCategory) return true;
    const product = element.closest<HTMLElement>('[id^="product-container-"]');
    const isProduct = Boolean(product && scope !== 'freeText');
    const currentProductCount = getProductColumnCount(style, category);
    const nextProductCount = isProduct ? nextProductColumnCount ?? currentProductCount : currentProductCount;
    if (nextCategoryColumnCount === currentCategoryCount && nextProductCount <= currentProductCount) return true;

    const currentWidth = getElementAvailableWidth(element);
    const laneIndex = Number(lane?.dataset.dragColumnIndex || 0);
    const nextLaneWidth = categoryContentWidth * (ratios[laneIndex] ?? ratios[0]);
    const currentLaneWidth = lane?.clientWidth || chunk?.clientWidth || nextLaneWidth;
    // Preserve the space used by offsets, borders, images, dividers and prices in the rendered card.
    const chunkInset = Math.max(0, currentLaneWidth - (chunk?.clientWidth || currentLaneWidth));
    const nextChunkWidth = nextLaneWidth - chunkInset;
    const nextStyle = { ...style, categoryColumnCount: nextCategoryColumnCount, columnCount: nextProductCount } as MenuStyle;
    const candidateWidth = isProduct
      ? (nextChunkWidth - getProductGridGap(nextStyle) * (nextProductCount - 1)) / nextProductCount
      : nextChunkWidth;
    const currentContainerWidth = (isProduct ? product?.clientWidth : chunk?.clientWidth) || currentLaneWidth;
    const layoutInset = isProduct && nextProductCount > 1 ? 16 : 0;
    if (element.hasAttribute('data-template-price')) {
      const value = element.querySelector<HTMLElement>('[data-price-value]')?.innerText ?? '';
      const css = getComputedStyle(element);
      const padding = (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0)
        + (parseFloat(css.borderLeftWidth) || 0) + (parseFloat(css.borderRightWidth) || 0);
      return measureRenderedText(value, resolveMinimumFontSize(style), css) <= candidateWidth - layoutInset - padding;
    }
    const reserve = Math.max(layoutInset, currentContainerWidth - currentWidth);
    return measureWordFitElement(element, { availableWidth: Math.max(1, candidateWidth - reserve) }).fits;
  });
};

export function applyGroupedWordFit(root: HTMLElement) {
  const groups = new Map<string, { nodes: HTMLElement[]; size: number; reduced: boolean }>();
  root.querySelectorAll<HTMLElement>('[data-word-fit="true"]').forEach(element => {
    if (!element.getClientRects().length) return;
    const data = element.dataset;
    const key = JSON.stringify([data.wordFitScope, data.wordFitBaseSize, data.wordFitFontFamily,
      data.wordFitFontWeight, data.wordFitFontStyle, data.wordFitLetterSpacing, data.wordFitTextTransform]);
    const size = Number(data.wordFitSize);
    if (!(size > 0)) return;
    const group = groups.get(key);
    if (group) {
      group.nodes.push(element);
      group.size = Math.min(size, group.size);
      group.reduced ||= data.wordFitReduced === 'true';
    } else groups.set(key, { nodes: [element], size, reduced: data.wordFitReduced === 'true' });
  });
  for (const { nodes, size, reduced } of groups.values()) {
    const value = reduced ? `${size}px` : '';
    for (const element of nodes) {
      if (element.style.getPropertyValue('--automenu-word-group-size') !== value) {
        element.style.setProperty('--automenu-word-group-size', value);
      }
    }
  }
}

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
      const result = measureWordFitElement(element, {
        availableWidth: getElementAvailableWidth(element) * ratio,
      });
      return result.fits;
    });
  });
};

const limitFeedbackTimers = new WeakMap<HTMLElement, number>();

export const triggerLimitFeedback = (element: HTMLElement | null | undefined) => {
  if (!element) return;
  window.clearTimeout(limitFeedbackTimers.get(element));
  element.classList.remove('automenu-limit-feedback');
  void element.offsetWidth;
  element.classList.add('automenu-limit-feedback');
  limitFeedbackTimers.set(element, window.setTimeout(() => element.classList.remove('automenu-limit-feedback'), 850));
};
