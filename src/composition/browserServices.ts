import { readCustomMarkerCache, writeCustomMarkerCache } from '../infrastructure/browser/customMarkerCache';
import type { AppServices } from '../application/appServices';
import { readFavoriteCache, writeFavoriteCache } from '../infrastructure/browser/favoriteCache';
import { uploadDataUrlAsset, uploadFileAsset } from '../infrastructure/supabase/assets';
import { listCustomMenuMarkers, saveCustomMenuMarker, deleteCustomMenuMarker } from '../infrastructure/supabase/customMenuMarkers';
import * as auth from '../infrastructure/supabase/auth';
import { isSupabaseConfigured } from '../infrastructure/supabase/client';
import { fetchFavorites, isPermanentFavoriteError, persistFavorite } from '../infrastructure/supabase/templateFavorites';
import { loadWorkspaceData, loadWorkspaceMenuData } from '../infrastructure/supabase/workspace/loadWorkspace';
import { listWorkspaceMenus, createWorkspaceMenu, deleteWorkspaceMenus, renameWorkspaceMenu, restoreWorkspaceMenus } from '../infrastructure/supabase/workspace/menus';
import { linkSyncedMenuProducts, listMenuProductSources, listMenuProductSyncs, unlinkSyncedMenuProducts } from '../infrastructure/supabase/workspace/productLinks';
import { getMenuPublication, loadPublicMenuPublication, publishWorkspaceMenu, verifyPublicMenuPublication, loadPublishedContent } from '../infrastructure/supabase/workspace/publications';
import { hydrateSnapshot, listMenuRevisions, loadMenuRevisionState } from '../infrastructure/supabase/workspace/revisions';
import { saveWorkspaceState } from '../infrastructure/supabase/workspace/saveWorkspace';
import { canPublishTemplates, loadTemplateVersion, publishWorkspaceTemplate, saveWorkspaceTemplate } from '../infrastructure/supabase/workspace/templates';
import { updateAccountIdentity } from '../infrastructure/supabase/workspace/settings';

import { historyV12Enabled, revisionGateway } from '../infrastructure/browser/revisionGateway';

export const browserServices = {
  revisions: historyV12Enabled() ? {...revisionGateway, load: async input => hydrateSnapshot(input.workspaceId!, await revisionGateway.load(input) as any,{ttlSeconds:300,requireAssets:true}) as any} : undefined,
  auth: { ...auth, isConfigured: isSupabaseConfigured },
  workspace: {
    listWorkspaceMenus, loadWorkspaceData, loadWorkspaceMenuData, saveWorkspaceState,
    createWorkspaceMenu, deleteWorkspaceMenus, renameWorkspaceMenu, restoreWorkspaceMenus,
    updateAccountIdentity, saveWorkspaceTemplate, canPublishTemplates, publishWorkspaceTemplate, loadTemplateVersion, listMenuRevisions, loadMenuRevisionState,
    listMenuProductSources, listMenuProductSyncs, linkSyncedMenuProducts, unlinkSyncedMenuProducts,
  },
  publications: { getMenuPublication, loadPublicMenuPublication, publishWorkspaceMenu, verifyPublicMenuPublication, loadPublishedContent },
  assets: { uploadFileAsset },
  customMarkers: { listCustomMenuMarkers, saveCustomMenuMarker, deleteCustomMenuMarker, readCustomMarkerCache, writeCustomMarkerCache },
  favorites: { fetchFavorites, isPermanentFavoriteError, persistFavorite, readFavoriteCache, writeFavoriteCache },
  async prepareMenuImport(options) {
    const [workflow, analysis, images, fileReader, jobs] = await Promise.all([
      import('../application/imports/menuImport'),
      import('../infrastructure/gemini/menuAnalysis'),
      import('../infrastructure/browser/imageProcessor'),
      import('../infrastructure/browser/fileToGenerativePart'),
      import('../infrastructure/supabase/workspace/importJobs'),
    ]);
    return workflow.prepareMenuImport(options, {
      analyzeMenuImage: analysis.analyzeMenuImage,
      fileToGenerativePart: fileReader.fileToGenerativePart,
      getImageDimensions: images.getImageDimensions,
      createCleanBackground: images.createCleanBackground,
      processDecoration: images.processDecoration,
      uploadFileAsset, uploadDataUrlAsset, createAiImportJob: jobs.createAiImportJob,
    });
  },
} satisfies AppServices;
