import { revisionOperationId } from '../../../application/revisions/operationId';
import type { MenuEditorState, MenuVersion } from '../../../domain/workspace/model';
import type { SortOption } from '../../../domain/menu/model';
import { createRenderSnapshot, normalizePersistedProducts, withStyleDefaults, DEFAULT_SORT_OPTION } from '../../../application/workspace/state';
import { historyV12Enabled, revisionRequest } from '../../browser/revisionGateway';
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
  if (historyV12Enabled() && versionType === 'published') {
    return revisionRequest('publication-version',{menuId,operationId:revisionOperationId(),editor:editorState,snapshot:renderSnapshot});
  }
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

export const hydrateSnapshot = async (workspaceId: string, snapshot: Record<string, any>, options: {ttlSeconds?:number;requireAssets?:boolean} = {}): Promise<import('../../../application/workspace/workspaceGateway').WorkspaceMenuContent> => {
  const snapshotProducts = normalizePersistedProducts(snapshot.products);
  const snapshotStyle = withStyleDefaults(snapshot.style || INITIAL_STYLE);
  const assetIds = collectStyleAssetIds(snapshotStyle);
  const findTokens = (value: unknown) => { if(typeof value === 'string' && value.startsWith('asset://')) assetIds.add(value.slice(8)); else if(Array.isArray(value)) value.forEach(findTokens); else if(value && typeof value === 'object') Object.values(value).forEach(findTokens); };
  findTokens(snapshot);
  collectProductAssetIds(snapshotProducts).forEach((assetId) => assetIds.add(assetId));
  const assetUrlMap = await resolveWorkspaceAssetMap(workspaceId, assetIds, options.ttlSeconds);
  const missing=[...assetIds].filter(id=>!assetUrlMap.get(id));
  if(options.requireAssets && missing.length) throw new Error('Recursos históricos indisponíveis. A prévia e a restauração foram bloqueadas para preservar a fidelidade.');
  const resolveTokens = (value: any): any => typeof value === 'string' && value.startsWith('asset://') ? assetUrlMap.get(value.slice(8)) : Array.isArray(value) ? value.map(resolveTokens) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveTokens(v)])) : value;
  return {
    products: resolveTokens(hydrateProductAssets(snapshotProducts, assetUrlMap)),
    style: resolveTokens(hydrateStyleAssets(snapshotStyle, assetUrlMap)),
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
