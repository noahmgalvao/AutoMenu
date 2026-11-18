import type { MenuEditorState, MenuVersion } from '../../../domain/workspace/model';
import type { SortOption } from '../../../domain/menu/model';
import { createRenderSnapshot, normalizePersistedProducts, withStyleDefaults, DEFAULT_SORT_OPTION } from '../../../application/workspace/state';
import { getSupabaseClient } from '../client';
import { INITIAL_STYLE } from '../../../domain/menu/defaults';
import {
  collectStyleAssetIds,
  collectProductAssetIds,
  resolveWorkspaceAssetMap,
  hydrateProductAssets,
  hydrateStyleAssets,
} from './assetReferences';
import { mapMenuVersionRow } from './rowMapping';

const waitForRetry = (delayMs: number) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));

const isVersionConflictError = (error: any) => {
  const message = String(error?.message || error?.details || '');
  return error?.code === '23505' || /duplicate key|menu_versions/i.test(message);
};

const isMissingActionLabelError = (error: any) => {
  const message = String(error?.message || error?.details || error?.hint || '');
  return message.includes('action_label') && (error?.code === 'PGRST204' || /schema cache|column/i.test(message));
};

export const insertMenuVersionWithRetry = async ({
  menuId,
  userId,
  editorState,
  renderSnapshot,
  versionType = 'snapshot',
  actionLabel = 'Alteração salva',
}: {
  menuId: string;
  userId: string;
  editorState: MenuEditorState;
  renderSnapshot: ReturnType<typeof createRenderSnapshot>;
  versionType?: MenuVersion['versionType'];
  actionLabel?: string;
}) => {
  const supabase = getSupabaseClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: latestVersionRow, error: latestVersionError } = await supabase
      .from('menu_versions')
      .select('version_number')
      .eq('menu_id', menuId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      throw latestVersionError;
    }

    const versionNumber = Number(latestVersionRow?.version_number || 0) + 1;
    const versionId = crypto.randomUUID();
    const versionPayload = {
      id: versionId,
      menu_id: menuId,
      version_number: versionNumber,
      version_type: versionType,
      editor_state: editorState,
      render_snapshot: renderSnapshot,
      created_by: userId,
      action_label: actionLabel,
    };
    let { error: insertVersionError } = await supabase.from('menu_versions').insert(versionPayload);
    if (insertVersionError && isMissingActionLabelError(insertVersionError)) {
      const { action_label: _actionLabel, ...legacyPayload } = versionPayload;
      const legacyResult = await supabase.from('menu_versions').insert(legacyPayload);
      insertVersionError = legacyResult.error;
    }

    if (!insertVersionError) {
      return { versionId, versionNumber };
    }

    lastError = insertVersionError;
    if (!isVersionConflictError(insertVersionError) || attempt === 3) {
      throw insertVersionError;
    }

    await waitForRetry(120 * (attempt + 1));
  }

  throw lastError;
};

export const hydrateSnapshot = async (workspaceId: string, snapshot: Record<string, any>) => {
  const snapshotProducts = normalizePersistedProducts(snapshot.products);
  const snapshotStyle = withStyleDefaults(snapshot.style || INITIAL_STYLE);
  const assetIds = collectStyleAssetIds(snapshotStyle);
  collectProductAssetIds(snapshotProducts).forEach((assetId) => assetIds.add(assetId));
  const assetUrlMap = await resolveWorkspaceAssetMap(workspaceId, assetIds);
  return {
    products: hydrateProductAssets(snapshotProducts, assetUrlMap),
    style: hydrateStyleAssets(snapshotStyle, assetUrlMap),
    sortOption: (snapshot.sortOption || DEFAULT_SORT_OPTION) as SortOption,
  };
};

export const listMenuRevisions = async (menuId: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('menu_id', menuId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapMenuVersionRow(row));
};

export const loadMenuRevisionState = async ({
  workspaceId,
  versionId,
}: {
  workspaceId: string;
  versionId: string;
}) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('id', versionId)
    .single();
  if (error) throw error;
  return hydrateSnapshot(workspaceId, data.render_snapshot || {});
};
