export interface ElementStyle {
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

export type WorkspaceStatus = 'active' | 'archived';
export type WorkspaceRole = 'owner' | 'member';
export type MenuStatus = 'draft' | 'published' | 'archived';
export type MenuVersionType = 'draft' | 'snapshot' | 'published';
export type TemplateScope = 'system' | 'workspace';
export type TemplateSourceType = 'preset' | 'user' | 'ai_import';
export type AssetType =
  | 'product_image'
  | 'menu_background'
  | 'added_image'
  | 'ai_source_image'
  | 'ai_extracted_asset'
  | 'template_preview';
export type AiImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

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

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  categoryId?: string | null;
  image?: string;
  imageAssetId?: string | null;
  isFreeText?: boolean;
  customMarginTop?: number;
  styles?: ElementStyle;
  boundingBox?: BoundingBox;
  extractedImages?: ExtractedImage[];
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

export interface CategoryPosition {
  pageIndex: number;
  columnIndex: number;
  y: number;
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
  boundingBox?: BoundingBox;
}

export interface PageBackground {
  pageIndex: number;
  url: string;
  assetId?: string | null;
}

export type MenuImportMode = 'complete' | 'products' | 'visual';

export interface BlankPageSlot {
  id: string;
  index: number;
  fixedPosition?: boolean;
}

export interface MenuStyle {
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
  backgroundAssetId?: string | null;
  pageBackgrounds?: PageBackground[];
  sourceImage?: string;
  sourceAssetId?: string | null;
  layoutMode: 'list' | 'grid' | 'cards';
  showImages: boolean;
  cardBackgroundColor?: string;
  imageScale?: number;
  columnCount: 1 | 2 | 3;
  categoryColumnCount?: 1 | 2 | 3;
  categoryColumnWidths?: number[];
  categoryPlacements?: Record<string, { pageIndex: number; columnIndex: number }>;
  categoryPositions?: Record<string, CategoryPosition>;
  customCategoryOrder?: string[];
  customProductOrder?: Record<string, string[]>;
  hiddenProductIds: string[];
  floatingText?: FloatingTextItem[];
  addedImages?: AddedImage[];
  blankPages?: BlankPageSlot[];
  pageBreaks?: string[];
  contentLayer?: 'front' | 'back';
  pagePadding?: number;
  globalRadius?: number;
  itemGap?: number;
  fontSizeLimits?: FontSizeLimits;
  minimumFontSize?: number;
  allowSameWordBreak?: boolean;
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

export interface Profile {
  userId: string;
  fullName: string | null;
  defaultWorkspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  splitCategoryAcrossPages: boolean;
  productsCanChangeCategory?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: WorkspaceStatus;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  boundingBox?: BoundingBox;
}

export interface Asset {
  id: string;
  workspaceId: string;
  bucket: string | null;
  path: string | null;
  sourceUrl: string | null;
  assetType: AssetType;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProduct {
  id: string;
  workspaceId: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: number;
  primaryAssetId: string | null;
  sortIndex: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Menu {
  id: string;
  workspaceId: string;
  name: string;
  status: MenuStatus;
  currentDraftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuEditorState {
  style: MenuStyle;
  freeTextProducts: Product[];
  sortOption: SortOption;
}

export interface MenuVersion {
  id: string;
  menuId: string;
  versionNumber: number;
  versionType: MenuVersionType;
  editorState: MenuEditorState;
  renderSnapshot: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface Template {
  id: string;
  workspaceId: string | null;
  scope: TemplateScope;
  name: string;
  sourceType: TemplateSourceType;
  currentVersionId: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  styleState: MenuStyle;
  previewAssetId: string | null;
  createdAt: string;
}

export interface AiImportJob {
  id: string;
  workspaceId: string;
  sourceAssetId: string | null;
  status: AiImportStatus;
  provider: string;
  model: string;
  rawResponse: Record<string, unknown>;
  normalizedResult: Record<string, unknown>;
  createdTemplateId: string | null;
  createdMenuId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceBootstrapData {
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
}

export interface LoadedWorkspaceData {
  profile: Profile;
  workspace: Workspace;
  menus: Menu[];
  menu: Menu;
  currentVersion: MenuVersion;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
}

export interface SaveWorkspaceResult {
  menu: Menu;
  currentVersion: MenuVersion;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
}
