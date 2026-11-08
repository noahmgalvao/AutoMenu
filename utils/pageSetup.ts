import type { MenuPageOrientation, MenuPagePreset, MenuPageSetup, MenuStyle } from '../types';

const CSS_PIXELS_PER_MM = 96 / 25.4;
const MIN_CUSTOM_DIMENSION_MM = 50;
const MAX_CUSTOM_DIMENSION_MM = 1000;

export const MENU_PAGE_PRESETS_MM: Record<Exclude<MenuPagePreset, 'custom'>, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Square: { width: 210, height: 210 },
};

export const DEFAULT_MENU_PAGE_SETUP: MenuPageSetup = {
  preset: 'A4',
  orientation: 'portrait',
  widthMm: MENU_PAGE_PRESETS_MM.A4.width,
  heightMm: MENU_PAGE_PRESETS_MM.A4.height,
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const clampDimension = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(MIN_CUSTOM_DIMENSION_MM, Math.min(MAX_CUSTOM_DIMENSION_MM, numeric))
    : fallback;
};

export const normalizeMenuPageSetup = (value: unknown): MenuPageSetup => {
  const source = isRecord(value) ? value : {};
  const preset: MenuPagePreset = source.preset === 'A5'
    || source.preset === 'Square'
    || source.preset === 'custom'
    ? source.preset
    : 'A4';
  const orientation: MenuPageOrientation = source.orientation === 'landscape' ? 'landscape' : 'portrait';

  if (preset !== 'custom') {
    const dimensions = MENU_PAGE_PRESETS_MM[preset];
    return {
      preset,
      orientation,
      widthMm: dimensions.width,
      heightMm: dimensions.height,
    };
  }

  const rawWidth = clampDimension(source.widthMm, DEFAULT_MENU_PAGE_SETUP.widthMm);
  const rawHeight = clampDimension(source.heightMm, DEFAULT_MENU_PAGE_SETUP.heightMm);
  return {
    preset,
    orientation,
    widthMm: Math.min(rawWidth, rawHeight),
    heightMm: Math.max(rawWidth, rawHeight),
  };
};

export interface ResolvedMenuPageDimensions {
  setup: MenuPageSetup;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
}

export const resolveMenuPageDimensions = (
  source?: Pick<MenuStyle, 'pageSetup'> | MenuPageSetup | null,
): ResolvedMenuPageDimensions => {
  const candidate = isRecord(source) && 'pageSetup' in source ? source.pageSetup : source;
  const setup = normalizeMenuPageSetup(candidate);
  const landscape = setup.orientation === 'landscape';
  const widthMm = landscape ? setup.heightMm : setup.widthMm;
  const heightMm = landscape ? setup.widthMm : setup.heightMm;

  return {
    setup,
    widthMm,
    heightMm,
    widthPx: Math.max(1, Math.round(widthMm * CSS_PIXELS_PER_MM)),
    heightPx: Math.max(1, Math.round(heightMm * CSS_PIXELS_PER_MM)),
  };
};
