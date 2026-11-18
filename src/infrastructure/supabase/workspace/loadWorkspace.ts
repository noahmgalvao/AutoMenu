import type { Profile, Workspace, LoadedWorkspaceData, MenuVersion, Menu } from '../../../domain/workspace/model';
import type { MenuStyle, Product } from '../../../domain/menu/model';
import { getSupabaseClient } from '../client';
import { listWorkspaceMenus, ensurePrimaryMenu, ensureWorkspaceMenuForCurrentUser } from './menus';
import {
  collectEditorStateAssetIds,
  collectProductAssetIds,
  addAssetId,
  resolveWorkspaceAssetMap,
  resolveEditorStateForApp,
  hydrateProductAssets,
  resolveProductRowsForApp,
} from './assetReferences';
import { mapCategoryRow, mapProfileRow, mapWorkspaceRow } from './rowMapping';
import { getLocalBootstrapData, markLocalStateAsMigrated } from '../../browser/legacyWorkspace';
import { saveWorkspaceState } from './saveWorkspace';
import { loadTemplatesForWorkspace } from './templates';

export const loadWorkspaceMenuData = async ({
  userId,
  profile,
  workspace,
  templates,
  menuId,
}: {
  userId: string;
  profile: Profile;
  workspace: Workspace;
  templates: MenuStyle[];
  menuId: string;
}): Promise<LoadedWorkspaceData> => {
  const supabase = getSupabaseClient();
  const menus = await listWorkspaceMenus(workspace.id);
  if (menus.length === 0) {
    return loadWorkspaceData(userId, menuId);
  }
  const menu = menus.find((candidate) => candidate.id === menuId) || menus[0];

  if (!menu.currentDraftVersionId) {
    return loadWorkspaceData(userId, menuId);
  }

  const { data: currentVersionRow, error: versionError } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('id', menu.currentDraftVersionId)
    .maybeSingle();

  if (versionError) {
    throw versionError;
  }

  if (!currentVersionRow) {
    return loadWorkspaceData(userId, menuId);
  }

  const rawSnapshotProducts = Array.isArray(currentVersionRow.render_snapshot?.products)
    ? currentVersionRow.render_snapshot.products as Product[]
    : null;
  const assetIds = collectEditorStateAssetIds(currentVersionRow.editor_state);
  collectProductAssetIds(rawSnapshotProducts).forEach((assetId) => assetIds.add(assetId));
  let categoryData: any[] | null = null;
  let productData: any[] | null = null;

  if (!rawSnapshotProducts) {
    const [{ data: loadedCategoryData, error: categoryError }, { data: loadedProductData, error: productError }] = await Promise.all([
      supabase.from('catalog_categories').select('*').eq('workspace_id', workspace.id).order('position', { ascending: true }),
      supabase.from('catalog_products').select('*').eq('workspace_id', workspace.id).order('sort_index', { ascending: true }),
    ]);

    if (categoryError) throw categoryError;
    if (productError) throw productError;

    categoryData = loadedCategoryData || [];
    productData = loadedProductData || [];
    productData.forEach((row) => addAssetId(assetIds, row.primary_asset_id));
  }

  const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
  const editorState = resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap);
  let snapshotProducts = rawSnapshotProducts ? hydrateProductAssets(rawSnapshotProducts, assetUrlMap) : null;

  if (!snapshotProducts) {
    const categories = (categoryData || []).map(mapCategoryRow);
    snapshotProducts = [
      ...resolveProductRowsForApp(categories, productData || [], assetUrlMap),
      ...editorState.freeTextProducts,
    ];
  }

  const currentVersion: MenuVersion = {
    id: currentVersionRow.id,
    menuId: currentVersionRow.menu_id,
    versionNumber: currentVersionRow.version_number,
    versionType: currentVersionRow.version_type,
    editorState,
    renderSnapshot: currentVersionRow.render_snapshot || {},
    createdBy: currentVersionRow.created_by,
    createdAt: currentVersionRow.created_at,
  };

  return {
    profile,
    workspace,
    menus,
    menu,
    currentVersion,
    products: snapshotProducts,
    style: editorState.style,
    templates,
    sortOption: editorState.sortOption,
  };
};

const bootstrapWorkspaceFromLocalState = async (workspaceId: string, userId: string) => {
  const localState = getLocalBootstrapData();
  const menu = await ensurePrimaryMenu(workspaceId);

  const result = await saveWorkspaceState({
    workspaceId,
    userId,
    menuId: menu.id,
    products: localState.products,
    style: localState.style,
    templates: localState.templates,
    sortOption: localState.sortOption,
  });

  markLocalStateAsMigrated();
  return result;
};

export const loadWorkspaceData = async (userId: string, menuId?: string | null): Promise<LoadedWorkspaceData> => {
  const supabase = getSupabaseClient();
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const profile = mapProfileRow(profileRow);
  if (!profile.defaultWorkspaceId) {
    throw new Error('Nenhum workspace associado ao usuário autenticado.');
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', profile.defaultWorkspaceId)
    .single();

  if (workspaceError) {
    throw workspaceError;
  }

  const workspace = mapWorkspaceRow(workspaceRow);
  const templatesPromise = loadTemplatesForWorkspace(workspace.id);
  let menus = await listWorkspaceMenus(workspace.id);
  let menu: Menu;
  if (menus.length === 0) {
    menu = await ensureWorkspaceMenuForCurrentUser({
      workspaceId: workspace.id,
      userId,
    });
    menus = [menu];
  } else {
    menu = (menuId ? menus.find((candidate) => candidate.id === menuId) : undefined) || menus[0];
    if (!menu.currentDraftVersionId) {
      menu = await ensureWorkspaceMenuForCurrentUser({
        workspaceId: workspace.id,
        userId,
        menuId: menu.id,
      });
    }
    if (!menus.some((candidate) => candidate.id === menu.id)) {
      menus = await listWorkspaceMenus(workspace.id);
    } else {
      menus = menus.map((candidate) => candidate.id === menu.id ? menu : candidate);
    }
  }

  let currentVersionRow: any = null;
  let templates: MenuStyle[] | null = null;
  if (menu.currentDraftVersionId) {
    const [{ data, error }, loadedTemplates] = await Promise.all([
      supabase
        .from('menu_versions')
        .select('*')
        .eq('id', menu.currentDraftVersionId)
        .maybeSingle(),
      templatesPromise,
    ]);

    if (error) throw error;

    currentVersionRow = data;
    templates = loadedTemplates;
    const rawSnapshotProducts = currentVersionRow && Array.isArray(currentVersionRow.render_snapshot?.products)
      ? currentVersionRow.render_snapshot.products as Product[]
      : null;
    const assetIds = collectEditorStateAssetIds(currentVersionRow?.editor_state);
    collectProductAssetIds(rawSnapshotProducts).forEach((assetId) => assetIds.add(assetId));
    const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
    const editorState = currentVersionRow ? resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap) : null;
    const snapshotProducts = currentVersionRow && rawSnapshotProducts
      ? hydrateProductAssets(rawSnapshotProducts, assetUrlMap)
      : null;

    if (currentVersionRow && snapshotProducts) {
      const currentVersion: MenuVersion = {
        id: currentVersionRow.id,
        menuId: currentVersionRow.menu_id,
        versionNumber: currentVersionRow.version_number,
        versionType: currentVersionRow.version_type,
        editorState: editorState!,
        renderSnapshot: currentVersionRow.render_snapshot || {},
        createdBy: currentVersionRow.created_by,
        createdAt: currentVersionRow.created_at,
      };

      return {
        profile,
        workspace,
        menus,
        menu,
        currentVersion,
        products: snapshotProducts,
        style: editorState!.style,
        templates,
        sortOption: editorState!.sortOption,
      };
    }
  }

  templates = templates || await templatesPromise;

  if (!currentVersionRow) {
    const bootstrapped = await bootstrapWorkspaceFromLocalState(workspace.id, userId);
    return {
      profile,
      workspace,
      menus: await listWorkspaceMenus(workspace.id),
      menu: bootstrapped.menu,
      currentVersion: bootstrapped.currentVersion,
      products: bootstrapped.products,
      style: bootstrapped.style,
      templates: bootstrapped.templates,
      sortOption: bootstrapped.sortOption,
    };
  }

  const [{ data: categoryData, error: categoryError }, { data: productData, error: productError }] = await Promise.all([
    supabase.from('catalog_categories').select('*').eq('workspace_id', workspace.id).order('position', { ascending: true }),
    supabase.from('catalog_products').select('*').eq('workspace_id', workspace.id).order('sort_index', { ascending: true }),
  ]);

  if (categoryError) throw categoryError;
  if (productError) throw productError;

  const assetIds = collectEditorStateAssetIds(currentVersionRow.editor_state);
  (productData || []).forEach((row) => addAssetId(assetIds, row.primary_asset_id));
  const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
  const editorState = resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap);
  const categories = (categoryData || []).map(mapCategoryRow);
  const snapshotProducts = [
    ...resolveProductRowsForApp(categories, productData || [], assetUrlMap),
    ...editorState.freeTextProducts,
  ];
  const currentVersion: MenuVersion = {
    id: currentVersionRow.id,
    menuId: currentVersionRow.menu_id,
    versionNumber: currentVersionRow.version_number,
    versionType: currentVersionRow.version_type,
    editorState: editorState,
    renderSnapshot: currentVersionRow.render_snapshot || {},
    createdBy: currentVersionRow.created_by,
    createdAt: currentVersionRow.created_at,
  };

  return {
    profile,
    workspace,
    menus,
    menu,
    currentVersion,
    products: snapshotProducts,
    style: editorState.style,
    templates,
    sortOption: editorState.sortOption,
  };
};
