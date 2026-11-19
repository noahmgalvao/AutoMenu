import type {
  LoadedWorkspaceData,
  Menu,
  MenuProductSource,
  MenuProductSync,
  MenuVersion,
  Profile,
  SaveWorkspaceResult,
  Workspace,
} from '../../domain/workspace/model';
import type { MenuStyle, Product, SortOption } from '../../domain/menu/model';

interface WorkspaceMenu {
  workspaceId: string;
  menuId: string;
}

interface MenuLink {
  workspaceId: string;
  sourceMenuId: string;
  targetMenuId: string;
}

export interface WorkspaceMenuContent {
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
}

export interface SaveWorkspaceInput extends WorkspaceMenuContent {
  workspaceId: string;
  userId: string;
  menuId?: string | null;
  templates: MenuStyle[];
  actionLabel?: string;
}

export interface WorkspaceGateway {
  loadWorkspaceData(userId: string, menuId?: string | null): Promise<LoadedWorkspaceData>;
  loadWorkspaceMenuData(input: {
    userId: string; profile: Profile; workspace: Workspace; templates: MenuStyle[]; menuId: string;
  }): Promise<LoadedWorkspaceData>;
  saveWorkspaceState(input: SaveWorkspaceInput): Promise<SaveWorkspaceResult>;
  createWorkspaceMenu(input: { workspaceId: string; userId: string; name: string; sourceMenuId?: string | null }): Promise<Menu>;
  renameWorkspaceMenu(input: WorkspaceMenu & { name: string }): Promise<Menu>;
  deleteWorkspaceMenus(input: { workspaceId: string; menuIds: string[] }): Promise<void>;
  updateAccountIdentity(input: { userId: string; workspaceId: string; fullName: string; workspaceName: string }):
    Promise<{ fullName: string; workspaceName: string }>;
  updateWorkspaceRuleSettings(input: { workspaceId: string; splitCategoryAcrossPages: boolean; productsCanChangeCategory: boolean }):
    Promise<{ splitCategoryAcrossPages: boolean; productsCanChangeCategory: boolean }>;
  listMenuRevisions(menuId: string): Promise<MenuVersion[]>;
  loadMenuRevisionState(input: { workspaceId: string; versionId: string }): Promise<WorkspaceMenuContent>;
  listMenuProductSources(input: { workspaceId: string; currentMenuId: string; currentProducts: Product[] }): Promise<MenuProductSource[]>;
  listMenuProductSyncs(input: { workspaceId: string; currentMenuId: string }): Promise<MenuProductSync[]>;
  linkSyncedMenuProducts(input: MenuLink & { productIds: string[] }): Promise<void>;
  unlinkSyncedMenuProducts(input: MenuLink): Promise<void>;
}
