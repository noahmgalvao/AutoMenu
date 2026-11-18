import type { AuthGateway } from './account/authGateway';
import type { AssetUploads } from './assets/assetUploads';
import type { ProcessedMenuImport } from './imports/importReview';
import type { ProcessMenuImportOptions } from './imports/menuImport';
import type { PublicationGateway } from './publishing/publicationGateway';
import type { TemplateFavoritesGateway } from './templates/favoriteQueue';
import type { WorkspaceGateway } from './workspace/workspaceGateway';

export interface AppServices {
  auth: AuthGateway;
  workspace: WorkspaceGateway;
  publications: PublicationGateway;
  assets: Pick<AssetUploads, 'uploadFileAsset'>;
  favorites: TemplateFavoritesGateway;
  prepareMenuImport(options: ProcessMenuImportOptions): Promise<ProcessedMenuImport>;
}
