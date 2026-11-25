import type { ExportPageSize } from '../../domain/publishing/exportProfiles';

const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

const normalizePageDimension = (value: number) => (
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0
);

const normalizePhysicalDimension = (value: number) => (
  Number.isFinite(value) && value > 0 ? value : undefined
);

export const getPageElementSizePx = (element: HTMLElement): ExportPageSize => {
  const domWidth = normalizePageDimension(Number(element.dataset.menuPageWidthPx));
  const domHeight = normalizePageDimension(Number(element.dataset.menuPageHeightPx));
  const widthMm = normalizePhysicalDimension(Number(element.dataset.menuPageWidthMm));
  const heightMm = normalizePhysicalDimension(Number(element.dataset.menuPageHeightMm));
  if (domWidth && domHeight) return { width: domWidth, height: domHeight, widthMm, heightMm };
  const computedStyle = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const width = [
    domWidth,
    element.offsetWidth,
    element.clientWidth,
    Number.parseFloat(computedStyle.width),
    Number.parseFloat(element.style.width),
    rect.width,
  ].map(normalizePageDimension).find(Boolean) || PAGE_WIDTH_PX;
  const height = [
    domHeight,
    element.offsetHeight,
    element.clientHeight,
    Number.parseFloat(computedStyle.height),
    Number.parseFloat(element.style.height),
    rect.height,
  ].map(normalizePageDimension).find(Boolean) || PAGE_HEIGHT_PX;

  return { width, height, widthMm, heightMm };
};

const stripPrintEditorState = (page: HTMLElement) => {
  page.querySelectorAll('button, [data-print-control="true"]:not([data-page-number]), [data-canvas-selection-outline], .automenu-image-resize-handle').forEach((node) => node.remove());
  page.querySelectorAll<HTMLElement>('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  page.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.classList.remove(
      'ring-4',
      'ring-2',
      'ring-blue-500',
      'ring-indigo-500',
      'bg-indigo-50/10',
      'bg-indigo-50/30',
      'bg-indigo-500/15'
    );
  });
};

export function preparePrintPageContent(page: HTMLElement) {
  page.classList.remove('ring-4', 'ring-blue-500', 'shadow-2xl');
  stripPrintEditorState(page);
}
