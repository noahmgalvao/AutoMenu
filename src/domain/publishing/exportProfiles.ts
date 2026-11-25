export interface ExportPageSize {
  width: number;
  height: number;
  widthMm?: number;
  heightMm?: number;
}

export type ExportFormat = 'PDF' | 'PNG' | 'JPG' | 'TIFF';
export type ImageFormat = Exclude<ExportFormat, 'PDF'>;
export const EXPORT_DPI = [72, 150, 300, 450, 600] as const;

export interface ExportSettings {
  dpi: number;
  bleed: number;
  marks: boolean;
  markOffset: number;
  color: 'RGB';
  quality: number;
}

const defaults: ExportSettings = { dpi: 300, bleed: 0, marks: false, markOffset: 0, color: 'RGB', quality: 100 };

export const normalizeExportSettings = (format: ExportFormat, settings: ExportSettings): ExportSettings => {
  const marks = format === 'PDF' && settings.marks;
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  return {
    dpi: EXPORT_DPI.some(dpi => dpi === settings.dpi) ? settings.dpi : defaults.dpi,
    bleed: format === 'PDF' || format === 'TIFF' ? clamp(settings.bleed, 0, 10, 0) : 0,
    marks,
    markOffset: marks ? clamp(settings.markOffset, 0, 10, 0) : 0,
    color: 'RGB',
    quality: format === 'JPG' ? clamp(settings.quality, 50, 100, 100) : 100,
  };
};

interface Preset {
  id: string;
  name: string;
  description?: string;
  settings: ExportSettings | null;
}

const preset = (id: string, name: string, settings: Partial<ExportSettings>, description?: string): Preset =>
  ({ id, name, description, settings: { ...defaults, ...settings } });

const digital = preset('digital', 'Compartilhamento digital', { dpi: 150 }, 'Arquivo leve para WhatsApp e e-mail.');
const high = preset('high', 'Alta resolução', {});
const custom: Preset = { id: 'custom', name: 'Personalizado', settings: null };

export const exportProfiles: Record<ExportFormat, { initial: string; options: readonly Preset[] }> = {
  PDF: {
    initial: 'professional',
    options: [
      digital,
      preset('office', 'Impressão comum', {}, 'Para impressoras domésticas e de escritório.'),
      preset('professional', 'Impressão profissional', { bleed: 3, marks: true }, 'Com sangria e marcas de corte para gráfica.'),
      preset('professional-no-marks', 'Impressão profissional sem marcas', { bleed: 3 }, 'Com sangria para gráficas que dispensam marcas de corte.'),
      preset('offset', 'Impressão offset', { bleed: 5, marks: true, markOffset: 2 }, 'Com sangria e marcas de corte afastadas.'),
      custom,
    ],
  },
  PNG: { initial: 'high', options: [digital, high, custom] },
  JPG: { initial: 'high', options: [{ ...digital, settings: { ...defaults, dpi: 150, quality: 85 } }, high, custom] },
  TIFF: {
    initial: 'high',
    options: [high, preset('professional', 'Impressão profissional', { bleed: 3 }, 'Com sangria de 3 mm.'), custom],
  },
};

export const CROP_MARK_LENGTH_MM = 4;

export function getExportGeometry(page: ExportPageSize, { dpi, bleed, marks, markOffset }: ExportSettings) {
  const trimWidth = page.widthMm ?? page.width * 25.4 / 96;
  const trimHeight = page.heightMm ?? page.height * 25.4 / 96;
  const bleedWidth = trimWidth + 2 * bleed;
  const bleedHeight = trimHeight + 2 * bleed;
  const margin = marks ? markOffset + CROP_MARK_LENGTH_MM + 0.5 : 0;
  const toPixels = (mm: number) => Math.max(1, Math.round(mm / 25.4 * dpi));
  return {
    trimWidth, trimHeight, bleedWidth, bleedHeight, margin,
    totalWidth: bleedWidth + 2 * margin,
    totalHeight: bleedHeight + 2 * margin,
    pixelWidth: toPixels(bleedWidth),
    pixelHeight: toPixels(bleedHeight),
    trimPixelWidth: toPixels(trimWidth),
    trimPixelHeight: toPixels(trimHeight),
  };
}
