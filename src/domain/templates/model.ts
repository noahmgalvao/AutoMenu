import type { MenuPageSetup, MenuPagePreset } from '../menu/pageModel';

export type TemplateScope = 'system' | 'workspace';

export type TemplateSourceType = 'preset' | 'user' | 'ai_import';

export interface TemplateDesign {
  schemaVersion: 2;
  header: 'centered' | 'left' | 'split' | 'hero' | 'banner';
  category: 'plain' | 'underline' | 'filled' | 'pill' | 'ribbon' | 'numbered';
  product: 'classic' | 'compact' | 'editorial' | 'card' | 'featured';
  image: 'none' | 'left' | 'top' | 'cover' | 'background';
  imageRatio: '1:1' | '4:3' | '3:4' | '16:9';
  price: 'inline' | 'right' | 'badge' | 'pill' | 'highlight';
  card: 'flat' | 'bordered' | 'soft' | 'elevated' | 'full-bleed';
  divider: 'none' | 'solid' | 'dotted' | 'ornamental';
  background: 'solid' | 'texture' | 'split' | 'accent-blocks';
}

export interface TemplateCatalogMetadata {
  description: string;
  category: string;
  tags: string[];
  keywords: string[];
  layoutFamily: TemplateDesign['product'];
  orientation: MenuPageSetup['orientation'];
  pagePreset: MenuPagePreset;
  sortOrder: number;
  catalogVersion: number;
}
