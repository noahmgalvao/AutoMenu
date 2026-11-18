export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedImage {
  id: string;
  type: 'food' | 'logo' | 'icon' | 'illustration' | 'separator' | 'other';
  description: string;
  relatedCategoryName?: string;
  relatedProductName?: string;
  boundingBox?: BoundingBox;
  url?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  boundingBox?: BoundingBox;
  nameBoundingBox?: BoundingBox;
  descriptionBoundingBox?: BoundingBox;
  priceBoundingBox?: BoundingBox;
  priceLineCount?: number;
  images?: ExtractedImage[];
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuItem[];
  boundingBox?: BoundingBox;
  nameBoundingBox?: BoundingBox;
}

export type MenuImportMode = 'complete' | 'products' | 'visual';
