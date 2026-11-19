import { getSupabaseClient } from '../client';
import { mapMenuRow } from './rowMapping';
import {
  assignCategoryIds,
  cloneJson,
  withStyleDefaults,
  DEFAULT_SORT_OPTION,
  createEditorState,
  createRenderSnapshot,
} from '../../../application/workspace/state';
import { INITIAL_PRODUCTS, INITIAL_STYLE } from '../../../domain/menu/defaults';
import type { Menu } from '../../../domain/workspace/model';
import { insertMenuVersionWithRetry } from './revisions';

export const ensurePrimaryMenu = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { data: existingMenu, error } = await supabase
    .from('menus')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existingMenu) {
    if (existingMenu.name === 'Main Menu') {
      const { data: renamedMenu, error: renameError } = await supabase
        .from('menus')
        .update({ name: 'Cardápio 1' })
        .eq('id', existingMenu.id)
        .select('*')
        .single();

      if (renameError) {
        throw renameError;
      }

      return mapMenuRow(renamedMenu);
    }

    return mapMenuRow(existingMenu);
  }

  const { data: createdMenu, error: createError } = await supabase
    .from('menus')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: 'Cardápio 1',
      status: 'draft',
    })
    .select('*')
    .single();

  if (createError) {
    throw createError;
  }

  return mapMenuRow(createdMenu);
};

export const listWorkspaceMenus = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapMenuRow);
};

export const renameWorkspaceMenu = async ({
  workspaceId,
  menuId,
  name,
}: {
  workspaceId: string;
  menuId: string;
  name: string;
}) => {
  const supabase = getSupabaseClient();
  const trimmedName = name.trim() || 'Cardápio';

  const { data, error } = await supabase
    .from('menus')
    .update({ name: trimmedName })
    .eq('id', menuId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapMenuRow(data);
};

export const deleteWorkspaceMenus = async ({
  workspaceId,
  menuIds,
}: {
  workspaceId: string;
  menuIds: string[];
}) => {
  if (!menuIds.length) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('menus')
    .delete()
    .in('id', menuIds)
    .eq('workspace_id', workspaceId);

  if (error) throw error;
};

const createInitialMenuVersionPayload = (blankMenuTitle?: string) => {
  const products = assignCategoryIds(cloneJson(INITIAL_PRODUCTS));
  const style = withStyleDefaults(cloneJson(INITIAL_STYLE));
  if (blankMenuTitle !== undefined) {
    style.menuTitle = blankMenuTitle;
    style.menuSubtitle = '';
  }
  const sortOption = DEFAULT_SORT_OPTION;

  return {
    editorState: createEditorState(style, [], sortOption),
    renderSnapshot: createRenderSnapshot(products, style, sortOption),
  };
};

const initializeWorkspaceMenu = async (menu: Menu, userId: string, blank = false) => {
  if (menu.currentDraftVersionId) {
    return menu;
  }

  const supabase = getSupabaseClient();
  const { editorState, renderSnapshot } = createInitialMenuVersionPayload(blank ? menu.name : undefined);
  const { versionId } = await insertMenuVersionWithRetry({
    menuId: menu.id,
    userId,
    editorState,
    renderSnapshot,
    actionLabel: 'Cardápio criado',
  });

  const { data: updatedMenuRow, error: updateError } = await supabase
    .from('menus')
    .update({ current_draft_version_id: versionId })
    .eq('id', menu.id)
    .is('current_draft_version_id', null)
    .select('*')
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (updatedMenuRow) {
    return mapMenuRow(updatedMenuRow);
  }

  const { data: currentMenuRow, error: currentMenuError } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menu.id)
    .single();

  if (currentMenuError) {
    throw currentMenuError;
  }

  return mapMenuRow(currentMenuRow);
};

const isMissingMenuRecoveryFunction = (error: any) => {
  const message = String(error?.message || error?.details || '');
  return error?.code === 'PGRST202'
    || (/ensure_my_workspace_menu/i.test(message) && /function|schema cache/i.test(message));
};

export const ensureWorkspaceMenuForCurrentUser = async ({
  workspaceId,
  userId,
  menuId,
}: {
  workspaceId: string;
  userId: string;
  menuId?: string | null;
}) => {
  const supabase = getSupabaseClient();
  const { editorState, renderSnapshot } = createInitialMenuVersionPayload();
  const { data, error } = await supabase.rpc('ensure_my_workspace_menu', {
    requested_workspace_id: workspaceId,
    requested_menu_id: menuId || null,
    initial_editor_state: editorState,
    initial_render_snapshot: renderSnapshot,
  });

  if (!error) {
    const menuRow = Array.isArray(data) ? data[0] : data;
    if (!menuRow || menuRow.workspace_id !== workspaceId) {
      throw new Error('Não foi possível recuperar o cardápio padrão deste ambiente.');
    }

    return mapMenuRow(menuRow);
  }

  if (!isMissingMenuRecoveryFunction(error)) {
    throw error;
  }

  const menus = await listWorkspaceMenus(workspaceId);
  if (menus.length === 0) {
    return createWorkspaceMenu({ workspaceId, userId, name: 'Cardápio 1' });
  }

  const selectedMenu = menus.find((candidate) => candidate.id === menuId) || menus[0];
  return initializeWorkspaceMenu(selectedMenu, userId);
};

export const createWorkspaceMenu = async ({
  workspaceId,
  userId,
  name,
  sourceMenuId,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  sourceMenuId?: string | null;
}) => {
  const supabase = getSupabaseClient();
  const menuId = crypto.randomUUID();

  const { data: menuRow, error } = await supabase
    .from('menus')
    .insert({
      id: menuId,
      workspace_id: workspaceId,
      name,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if (sourceMenuId) {
    const { data: sourceMenu, error: sourceMenuError } = await supabase
      .from('menus')
      .select('current_draft_version_id')
      .eq('id', sourceMenuId)
      .eq('workspace_id', workspaceId)
      .single();
    if (sourceMenuError) throw sourceMenuError;

    const { data: sourceVersion, error: sourceVersionError } = await supabase
      .from('menu_versions')
      .select('*')
      .eq('id', sourceMenu.current_draft_version_id)
      .single();
    if (sourceVersionError) throw sourceVersionError;

    const { versionId } = await insertMenuVersionWithRetry({
      menuId,
      userId,
      editorState: cloneJson(sourceVersion.editor_state),
      renderSnapshot: cloneJson(sourceVersion.render_snapshot),
      actionLabel: 'Cardápio criado a partir de outro cardápio',
    });
    const { data: copiedMenu, error: copiedMenuError } = await supabase
      .from('menus')
      .update({ current_draft_version_id: versionId })
      .eq('id', menuId)
      .select('*')
      .single();
    if (copiedMenuError) throw copiedMenuError;
    return mapMenuRow(copiedMenu);
  }

  return initializeWorkspaceMenu(mapMenuRow(menuRow), userId, true);
};

export const resolveActiveMenu = async (workspaceId: string, menuId?: string | null) => {
  if (!menuId) {
    return ensurePrimaryMenu(workspaceId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menuId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return mapMenuRow(data);
  }

  return ensurePrimaryMenu(workspaceId);
};
