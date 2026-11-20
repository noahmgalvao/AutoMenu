import type { AppServices } from '../application/appServices';
import { readFavoriteCache, writeFavoriteCache } from '../infrastructure/browser/favoriteCache';
import { updatePortablePublicationMenuSlug } from '../infrastructure/browser/portablePublicationCache';
import { uploadDataUrlAsset, uploadFileAsset } from '../infrastructure/supabase/assets';
import { listCustomMenuMarkers, saveCustomMenuMarker, deleteCustomMenuMarker } from '../infrastructure/supabase/customMenuMarkers';
import * as auth from '../infrastructure/supabase/auth';
import { isSupabaseConfigured } from '../infrastructure/supabase/client';
import { fetchFavorites, isPermanentFavoriteError, persistFavorite } from '../infrastructure/supabase/templateFavorites';
import { loadWorkspaceData, loadWorkspaceMenuData } from '../infrastructure/supabase/workspace/loadWorkspace';
import { createWorkspaceMenu, deleteWorkspaceMenus, renameWorkspaceMenu } from '../infrastructure/supabase/workspace/menus';
import { linkSyncedMenuProducts, listMenuProductSources, listMenuProductSyncs, unlinkSyncedMenuProducts } from '../infrastructure/supabase/workspace/productLinks';
import { getMenuPublication, loadPublicMenuPublication, publishWorkspaceMenu, updatePublicationMenuSlug } from '../infrastructure/supabase/workspace/publications';
import { listMenuRevisions, loadMenuRevisionState } from '../infrastructure/supabase/workspace/revisions';
import { saveWorkspaceState } from '../infrastructure/supabase/workspace/saveWorkspace';
import { updateAccountIdentity, updateWorkspaceRuleSettings } from '../infrastructure/supabase/workspace/settings';

export const browserServices = {
  auth: { ...auth, isConfigured: isSupabaseConfigured },
  workspace: {
    loadWorkspaceData, loadWorkspaceMenuData, saveWorkspaceState,
    createWorkspaceMenu, deleteWorkspaceMenus, renameWorkspaceMenu,
    updateAccountIdentity, updateWorkspaceRuleSettings, listMenuRevisions, loadMenuRevisionState,
    listMenuProductSources, listMenuProductSyncs, linkSyncedMenuProducts, unlinkSyncedMenuProducts,
  },
  publications: { getMenuPublication, loadPublicMenuPublication, publishWorkspaceMenu, updatePublicationMenuSlug, updatePortablePublicationMenuSlug },
  assets: { uploadFileAsset },
  customMarkers: { listCustomMenuMarkers, saveCustomMenuMarker, deleteCustomMenuMarker },
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
