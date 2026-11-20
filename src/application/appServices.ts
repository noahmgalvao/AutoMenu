import type { CustomMarkerCache } from './customMarkerCache';
import type { CustomMenuMarker } from '../domain/menu/model';
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
  customMarkers: {
    readCustomMarkerCache(userId: string): CustomMarkerCache;
    writeCustomMarkerCache(userId: string, cache: CustomMarkerCache): boolean;
    listCustomMenuMarkers(userId: string): Promise<CustomMenuMarker[]>;
    saveCustomMenuMarker(userId: string, marker: CustomMenuMarker): Promise<void>;
    deleteCustomMenuMarker(userId: string, id: string): Promise<void>;
  };
  prepareMenuImport(options: ProcessMenuImportOptions): Promise<ProcessedMenuImport>;
}
