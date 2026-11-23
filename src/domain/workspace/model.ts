import type { BoundingBox } from '../imports/model';
import type { MenuStyle, Product, SortOption } from '../menu/model';
import type { TemplateCatalogMetadata, TemplateScope, TemplateSourceType } from '../templates/model';

export type WorkspaceStatus = 'active' | 'archived';

export type WorkspaceRole = 'owner' | 'member';

export type MenuStatus = 'draft' | 'published' | 'archived';

export type MenuVersionType = 'draft' | 'snapshot' | 'published';

export type AssetType =
  | 'product_image'
  | 'menu_background'
  | 'added_image'
  | 'ai_source_image'
  | 'ai_extracted_asset'
  | 'template_preview';

export type AiImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

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
  actionLabel?: string | null;
}

export interface MenuPublication {
  id: string;
  menuId: string;
  workspaceId: string;
  restaurantSlug: string;
  menuSlug: string;
  publishedVersionId: string;
  pdfAssetId: string | null;
  pdfBucket: string;
  pdfPath: string | null;
  pdfUrl: string | null;
  pdfFilename: string;
  pdfOptions: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  contentSignature: string;
  portableSnapshotUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuProductSource {
  menu: Menu;
  products: Product[];
}

export interface MenuProductSync {
  menu: Menu;
  productCount: number;
}

export interface Template {
  catalogMetadata?: TemplateCatalogMetadata;
  catalogSourceTemplateId?: string;
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
