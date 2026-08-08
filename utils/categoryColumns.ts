import type { MenuStyle } from '../types';

const MIN_COLUMN_RATIO = 0.12;

export const normalizeColumnWidths = (
  widths: number[] | undefined,
  columnCount: number,
): number[] => {
  const count = Math.max(1, Math.floor(columnCount));
  if (!Array.isArray(widths) || widths.length !== count) {
    return Array.from({ length: count }, () => 1 / count);
  }

  const safe = widths.map((width) => {
    const parsed = Number(width);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
  const total = safe.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return Array.from({ length: count }, () => 1 / count);

  const normalized = safe.map((width) => Math.max(MIN_COLUMN_RATIO, width / total));
  const normalizedTotal = normalized.reduce((sum, width) => sum + width, 0);
  return normalized.map((width) => width / normalizedTotal);
};

export const getPageColumnWidths = (
  style: MenuStyle,
  columnCount: number,
  liveWidths?: number[] | null,
) => normalizeColumnWidths(
  liveWidths || style.categoryColumnWidths,
  columnCount,
);

export const getColumnGridTemplate = (widths: number[]) => (
  widths.map((width) => `minmax(0, ${Math.max(0.001, width)}fr)`).join(' ')
);
