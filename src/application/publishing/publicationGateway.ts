import type { Menu, MenuPublication, Workspace } from '../../domain/workspace/model';
import type { WorkspaceMenuContent } from '../workspace/workspaceGateway';

export type PublicationAddress = { restaurantSlug: string; menuSlug: string; portableSnapshotUrl?: string | null };
export type PublicationAvailability = 'checking' | 'online' | 'offline' | 'unknown';

export interface PublicationGateway {
  getMenuPublication(menuId: string): Promise<MenuPublication | null>;
  publishWorkspaceMenu(input: WorkspaceMenuContent & {
    workspace: Workspace;
    menu: Menu;
    userId: string;
    menuSlug?: string;
  }): Promise<MenuPublication>;
  loadPublicMenuPublication(input: PublicationAddress): Promise<MenuPublication | null>;
  verifyPublicMenuPublication(input: PublicationAddress): Promise<{
    availability: PublicationAvailability;
    contentSignature?: string;
  }>;
  loadPublishedContent(publication: MenuPublication): Promise<WorkspaceMenuContent>;
}
