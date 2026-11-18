export type MenuPagePreset = 'A4' | 'A5' | 'A3' | 'Letter' | 'Square' | 'screen' | 'custom';

export type MenuPageOrientation = 'portrait' | 'landscape';

export interface MenuPageSetup {
  preset: MenuPagePreset;
  orientation: MenuPageOrientation;
  widthMm: number;
  heightMm: number;
}
