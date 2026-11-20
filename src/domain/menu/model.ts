import type { BoundingBox, ExtractedImage } from '../imports/model';
import type { TemplateDesign, TemplateCatalogMetadata, TemplateScope, TemplateSourceType } from '../templates/model';
import type { MiniFoodKind } from './miniFoods';
import type { MenuPageSetup } from './pageModel';

export interface TextOutline {
  color: string;
  width: number;
}

export interface ElementStyle {
  textOutline?: TextOutline;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'bold' | '300' | '400' | '500' | '600' | '700';
  italic?: boolean;
  underline?: boolean;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  letterSpacing?: number;
  marginBottom?: number;
  lineHeight?: number;
}

export interface FontSizeLimits {
  menuTitle: number;
  menuSubtitle: number;
  category: number;
  productName: number;
  productPrice: number;
  productDescription: number;
  freeText: number;
}

export interface MenuMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  columnGap: number;
}

export interface MenuContentSpacing {
  headerToContent: number;
  categoryToProduct: number;
  productNameToDescription: number;
  betweenProducts: number;
  productNameToPrice: number;
}

export type FontSizeLimitKey = keyof FontSizeLimits;

export type PriceDecimalPlaces = 0 | 1 | 2;

export type PriceDecimalSeparator = ',' | '.';

export type CategoryDividerStyle =
  | 'none'
  | 'solid'
  | 'strong'
  | 'double'
  | 'dashed'
  | 'dotted'
  | 'fade'
  | 'tapered'
  | 'beaded'
  | 'ornamental'
  | 'accent';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  categoryId?: string | null;
  image?: string;
  imageAssetId?: string | null;
  imageAlignment?: 'left' | 'center' | 'right';
  isFreeText?: boolean;
  customMarginTop?: number;
  freeTextWidth?: number;
  styles?: ElementStyle;
  boundingBox?: BoundingBox;
  extractedImages?: ExtractedImage[];
}

export interface CategoryPosition {
  pageIndex: number;
  columnIndex: number;
  y: number;
  x?: number;
  pageX?: number;
}

export interface FloatingTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  pageIndex: number;
}

export interface AddedImage {
  id: string;
  url: string;
  assetId?: string | null;
  x: number;
  y: number;
  width: number;
  pageIndex: number;
  zIndex?: number;
  repeatAsBackground?: boolean;
  backgroundPromptDismissed?: boolean;
  previousZIndex?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  shape?: CanvasShape;
  crop?: CanvasImageCrop;
  boundingBox?: BoundingBox;
}

export interface CanvasImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
}

export type CanvasShapeKind = MiniFoodKind | 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'polygon' | 'star' | 'arrow' | 'line';

export interface CanvasShape {
  kind: CanvasShapeKind;
  text?: string;
  textColor?: string;
  textBackground?: string;
  textStyle?: ElementStyle;
  textAlign?: 'left' | 'center' | 'right';
  fill: string;
  stroke: string;
  strokeWidth: number;
  ratio: number;
  rotation: number;
  corners: number;
  points: number;
  innerRadius: number;
}

export type MenuBorderScope = 'header' | 'category' | 'categoryGroup' | 'product' | 'price' | 'productImage' | 'freeText';

export type MenuBorderSide = 'top' | 'right' | 'bottom' | 'left';

export interface MenuBorder {
  sides: MenuBorderSide[];
  color: string;
  thickness: number;
  length: number;
  radius: number;
  offset: number;
  pattern: 'solid' | 'dashed' | 'dotted' | 'double';
}

export interface CustomMenuMarker {
  id: string;
  shape: CanvasShape;
}

export type MenuMarker = CustomMenuMarker | MiniFoodKind | 'none' | 'dot' | 'circle' | 'diamond' | 'arrow' | 'check' | 'dash' | 'number' | 'number-circle' | 'number-square' | 'number-padded';

export interface CategoryImage {
  crop?: { x: number; y: number };
  horizontal?: boolean;
  vertical?: boolean;
  url: string;
  assetId?: string | null;
  width?: number;
  height?: number;
}

export interface PageBackground {
  pageIndex: number;
  url: string;
  assetId?: string | null;
}

export interface CopiedPageLayout {
  showHeader: boolean;
  columns: {
    startsCategory: boolean;
    flowOffsetBefore?: number;
    estimatedHeight: number;
    items: ({ type: 'category-header' } | { type: 'product-item' | 'product-row' | 'free-text-row'; ids: string[] })[];
  }[][];
}

export interface BlankPageSlot {
  id: string;
  index: number;
  fixedPosition?: boolean;
  copiedLayout?: CopiedPageLayout;
}

export interface MenuStyle {
  design?: TemplateDesign;
  borders?: Partial<Record<Exclude<MenuBorderScope, 'freeText'>, MenuBorder>>;
  freeTextBorders?: Record<string, MenuBorder>;
  fills?: Partial<Record<Exclude<MenuBorderScope, 'freeText' | 'product'>, string>>;
  freeTextFills?: Record<string, string>;
  freeTextBackgrounds?: Record<string, { x: number; y: number; width: number; pageIndex: number }>;
  markers?: Partial<Record<'category' | 'product', MenuMarker>>;
  catalogMetadata?: TemplateCatalogMetadata;
  appliedTemplateId?: string;
  appliedTemplateVersionId?: string | null;
  templateBackgroundFit?: 'cover' | 'fill';
  id: string;
  name: string;
  scope?: TemplateScope;
  sourceType?: TemplateSourceType;
  templateVersionId?: string | null;
  isLocked?: boolean;
  menuTitle: string;
  menuSubtitle: string;
  fontFamily: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundImage?: string;
  miniFoodTextureColor?: string;
  backgroundAssetId?: string | null;
  pageBackgrounds?: PageBackground[];
  menuBackgroundPhoto?: Pick<AddedImage, 'url' | 'assetId'> & { originKey?: string };
  sourceImage?: string;
  sourceAssetId?: string | null;
  layoutMode: 'list' | 'grid' | 'cards';
  showImages: boolean;
  showCategoryImages?: boolean;
  cardBackgroundColor?: string;
  cardBackgroundColorOverride?: boolean;
  productCardShape?: 'template' | 'square' | 'rounded' | 'soft' | 'arch';
  productImageFrame?: 'template' | 'fill' | 'rounded' | 'circle' | 'arch';
  productImageFlips?: Record<string, { horizontal?: boolean; vertical?: boolean }>;
  productPhotoCrops?: Record<string, { x: number; y: number }>;
  imageScale?: number;
  categoryImageScale?: number;
  columnCount: 1 | 2 | 3;
  categoryColumnCount?: 1 | 2 | 3;
  categoryColumnWidths?: number[];
  categoryDividerStyles?: Record<string, CategoryDividerStyle>;
  productDividerStyle?: CategoryDividerStyle;
  productDividerStyles?: Record<string, CategoryDividerStyle>;
  categoryPlacements?: Record<string, { pageIndex: number; columnIndex: number }>;
  categoryPositions?: Record<string, CategoryPosition>;
  customCategoryOrder?: string[];
  customProductOrder?: Record<string, string[]>;
  manualProductOrder?: boolean;
  hiddenProductIds: string[];
  floatingText?: FloatingTextItem[];
  addedImages?: AddedImage[];
  categoryImages?: Record<string, CategoryImage>;
  blankPages?: BlankPageSlot[];
  pageBreaks?: string[];
  pageSetup?: MenuPageSetup;
  portraitPageLayout?: {
    setup: MenuPageSetup;
    categoryColumnCount?: 1 | 2 | 3;
    columnCount: 1 | 2 | 3;
    categoryColumnWidths?: number[];
    positions?: Record<string, { portrait: CategoryPosition; landscape: CategoryPosition }>;
    margins?: {
      portrait?: MenuMargins;
      landscape?: MenuMargins;
      portraitPadding?: number;
      landscapePadding?: number;
    };
  };
  contentLayer?: 'front' | 'back';
  freeTextLayers?: Record<string, 2 | 4>;
  textContrastFills?: Record<string, string>;
  pagePadding?: number;
  globalRadius?: number;
  itemGap?: number;
  fontSizeLimits?: FontSizeLimits;
  minimumFontSize?: number;
  allowSameWordBreak?: boolean;
  priceDecimalPlaces?: PriceDecimalPlaces;
  priceDecimalSeparator?: PriceDecimalSeparator;
  priceCurrencySymbol?: string;
  showPrices?: boolean;
  showCurrencySymbol?: boolean;
  showPageNumbers?: boolean;
  margins?: MenuMargins;
  contentSpacing?: MenuContentSpacing;
  elementColorOverrides?: Partial<Record<'menuTitle' | 'menuSubtitle' | 'pageNumber' | 'category' | 'productName' | 'productPrice' | 'productDescription', boolean>>;
  elementStyles: {
    menuTitle?: ElementStyle;
    menuSubtitle?: ElementStyle;
    pageNumber?: ElementStyle;
    category: ElementStyle;
    productName: ElementStyle;
    productPrice: ElementStyle;
    productDescription: ElementStyle;
  };
}

export interface SortOption {
  field: 'name' | 'price' | 'category';
  direction: 'asc' | 'desc';
}

export interface BulkEditConfig {
  category: string;
  percentage: number;
}
