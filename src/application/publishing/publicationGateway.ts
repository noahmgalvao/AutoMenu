import type { Menu, MenuPublication, Workspace } from '../../domain/workspace/model';
import type { WorkspaceMenuContent } from '../workspace/workspaceGateway';

export interface PublicationGateway {
  getMenuPublication(menuId: string): Promise<MenuPublication | null>;
  publishWorkspaceMenu(input: WorkspaceMenuContent & {
    workspace: Workspace;
    menu: Menu;
    userId: string;
    pdfBlob: Blob;
    pdfFilename: string;
    pdfOptions: Record<string, unknown>;
    menuSlug?: string;
  }): Promise<MenuPublication>;
  loadPublicMenuPublication(input: { restaurantSlug: string; menuSlug: string; portableSnapshotUrl?: string | null }):
    Promise<MenuPublication | null>;
  updatePublicationMenuSlug(input: { publicationId: string; menuSlug: string }): Promise<MenuPublication>;
  updatePortablePublicationMenuSlug(publication: MenuPublication, menuSlug: string): MenuPublication;
}
