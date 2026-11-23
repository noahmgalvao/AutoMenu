import type { Profile, Workspace, Menu, MenuVersion, MenuPublication, Category, Template, TemplateVersion } from '../../../domain/workspace/model';

export const mapProfileRow = (row: any): Profile => ({
  userId: row.user_id,
  fullName: row.full_name,
  defaultWorkspaceId: row.default_workspace_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapWorkspaceRow = (row: any): Workspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  ownerUserId: row.owner_user_id,
  status: row.status,
  settings: {
    splitCategoryAcrossPages: Boolean(row.settings?.split_category_across_pages),
    productsCanChangeCategory: Boolean(row.settings?.productsCanChangeCategory),
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapMenuRow = (row: any): Menu => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  status: row.status,
  currentDraftVersionId: row.current_draft_version_id,
  publishedVersionId: row.published_version_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapMenuVersionRow = (row: any, editorState = row.editor_state): MenuVersion => ({
  id: row.id,
  menuId: row.menu_id,
  versionNumber: row.version_number,
  versionType: row.version_type,
  editorState,
  renderSnapshot: row.render_snapshot || {},
  createdBy: row.created_by,
  createdAt: row.created_at,
  actionLabel: row.action_label || null,
});

export const mapPublicationRow = (row: any, pdfUrl: string | null = null): MenuPublication => ({
  id: row.id,
  menuId: row.menu_id,
  workspaceId: row.workspace_id,
  restaurantSlug: row.restaurant_slug,
  menuSlug: row.menu_slug,
  publishedVersionId: row.published_version_id,
  pdfAssetId: row.pdf_asset_id,
  pdfBucket: row.pdf_bucket || 'menu-assets',
  pdfPath: row.pdf_path || null,
  pdfUrl,
  pdfFilename: row.pdf_filename || 'cardapio.pdf',
  pdfOptions: row.pdf_options || {},
  snapshot: row.snapshot || {},
  contentSignature: row.content_signature,
  portableSnapshotUrl: null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapCategoryRow = (row: any): Category => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  slug: row.slug,
  position: row.position,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapTemplateRow = (row: any): Template => ({
  id: row.id,
  workspaceId: row.workspace_id,
  scope: row.scope,
  name: row.name,
  catalogMetadata: row.catalog_metadata || undefined,
  catalogSourceTemplateId: row.catalog_source_template_id || undefined,
  sourceType: row.source_type,
  currentVersionId: row.current_version_id,
  isLocked: row.is_locked,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapTemplateVersionRow = (row: any): TemplateVersion => ({
  id: row.id,
  templateId: row.template_id,
  versionNumber: row.version_number,
  styleState: row.style_state,
  previewAssetId: row.preview_asset_id,
  createdAt: row.created_at,
});
