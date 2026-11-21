import { getSupabaseClient } from '../client';
import { PRESET_TEMPLATE_IDS, withStyleDefaults, mergeTemplates, assignTemplateMetadata } from '../../../application/workspace/state';
import { mapTemplateRow, mapTemplateVersionRow } from './rowMapping';
import type { TemplateVersion } from '../../../domain/workspace/model';
import type { MenuStyle } from '../../../domain/menu/model';
import { resolveWorkspaceAssetMap, collectTemplateAssetIds, hydrateStyleAssets, normalizeStyleAssets } from './assetReferences';
import { PRESET_TEMPLATES } from '../../../domain/menu/defaults';

export const loadTemplatesForWorkspace = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const [{ data: systemRows, error: systemError }, { data: workspaceRows, error: workspaceError }] = await Promise.all([
    supabase.from('templates').select('*').eq('scope', 'system').order('created_at', { ascending: true }),
    supabase.from('templates').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
  ]);

  if (workspaceError) {
    throw workspaceError;
  }

  const templateRows = [...(systemError ? [] : (systemRows || [])), ...(workspaceRows || [])]
    .filter((row) => row.scope !== 'system' || (PRESET_TEMPLATE_IDS.has(row.id) && row.catalog_active !== false))
    .map(mapTemplateRow);
  const versionIds = templateRows.map((template) => template.currentVersionId).filter(Boolean);

  let versionRows: TemplateVersion[] = [];
  if (versionIds.length > 0) {
    const { data, error } = await supabase.from('template_versions').select('*').in('id', versionIds);
    if (error) {
      throw error;
    }
    versionRows = (data || []).map(mapTemplateVersionRow);
  }

  const assetUrlMap = await resolveWorkspaceAssetMap(workspaceId, collectTemplateAssetIds(versionRows));
  const versionsById = new Map(versionRows.map((version) => [version.id, version]));
  const resolvedTemplates = templateRows
    .map((template) => {
      const version = template.currentVersionId ? versionsById.get(template.currentVersionId) : undefined;
      const fallbackPreset = PRESET_TEMPLATES.find((preset) => preset.id === template.id);
      const styleState = version?.styleState || fallbackPreset;

      if (!styleState) {
        return null;
      }

      return hydrateStyleAssets(
        withStyleDefaults({
          ...styleState,
          id: template.id,
          name: template.name,
          scope: template.scope,
          catalogMetadata: template.catalogMetadata,
          sourceType: template.sourceType,
          templateVersionId: version?.id || null,
          isLocked: template.isLocked,
        }),
        assetUrlMap,
      );
    })
    .filter(Boolean) as MenuStyle[];

  const workspaceTemplates = resolvedTemplates.filter((template) => template.scope === 'workspace');
  const systemTemplates = resolvedTemplates.filter((template) => template.scope === 'system');

  return mergeTemplates(workspaceTemplates, systemTemplates);
};

export const syncWorkspaceTemplates = async (workspaceId: string, userId: string, templates: MenuStyle[]) => {
  const supabase = getSupabaseClient();
  const workspaceTemplates = assignTemplateMetadata(templates).filter((template) => template.scope === 'workspace');

  if (!workspaceTemplates.length) return mergeTemplates([], []);
  const { data: existing, error: lookupError } = await supabase.from('templates')
    .select('id,current_version_id').eq('workspace_id', workspaceId);
  if (lookupError) throw lookupError;
  const persisted = new Set((existing || []).filter((template) => template.current_version_id).map((template) => template.id));
  // The editor stores imports as new template IDs. Never overwrite an already saved version
  // when autosave hydrates an old copy of the workspace.
  const normalizedTemplates = await Promise.all(
    workspaceTemplates.filter((template) => !persisted.has(template.id)).map(async (template) => {
      const normalizedStyle = await normalizeStyleAssets(workspaceId, userId, template);
      return {
        ...normalizedStyle,
        scope: 'workspace' as const,
        sourceType: normalizedStyle.sourceType || 'user',
        templateVersionId: normalizedStyle.templateVersionId || `${normalizedStyle.id}::v1`,
        isLocked: false,
      };
    }),
  );

  const templateRows = normalizedTemplates.map((template) => ({
    id: template.id,
    workspace_id: workspaceId,
    scope: 'workspace',
    name: template.name,
    source_type: template.sourceType || 'user',
    is_locked: false,
  }));

  const versionRows = normalizedTemplates.map((template) => ({
    id: template.templateVersionId,
    template_id: template.id,
    version_number: 1,
    style_state: template.sourceType === 'user' && template.backgroundAssetId
      ? { ...template, backgroundImage: undefined } : template,
    preview_asset_id: template.backgroundAssetId || null,
  }));

  if (templateRows.length > 0) {
    const { error: upsertTemplateError } = await supabase.from('templates').upsert(templateRows, { onConflict: 'id', ignoreDuplicates: true });
    if (upsertTemplateError) {
      throw upsertTemplateError;
    }

    const { error: upsertVersionError } = await supabase
      .from('template_versions')
      .upsert(versionRows, { onConflict: 'id', ignoreDuplicates: true });

    if (upsertVersionError) {
      throw upsertVersionError;
    }

    for (const template of normalizedTemplates) {
      const { error } = await supabase.from('templates')
        .update({ current_version_id: template.templateVersionId })
        .eq('workspace_id', workspaceId).eq('id', template.id).is('current_version_id', null);
      if (error) throw error;
    }
  }

  // Autosave can be based on an older menu snapshot. Absence in that snapshot is not a deletion.
  const normalizedById = new Map(normalizedTemplates.map((template) => [template.id, template]));
  return mergeTemplates(workspaceTemplates.map((template) => normalizedById.get(template.id) || template), []);
};

export async function saveWorkspaceTemplate({ workspaceId, userId, template }: {
  workspaceId: string; userId: string; template: MenuStyle;
}) {
  if (template.backgroundAssetId) {
    const urls = await resolveWorkspaceAssetMap(workspaceId, [template.backgroundAssetId]);
    const url = urls.get(template.backgroundAssetId);
    if (!url) throw new Error('A imagem de fundo não está disponível neste workspace.');
    template = { ...template, backgroundImage: url };
  }
  const saved = (await syncWorkspaceTemplates(workspaceId, userId, [template])).find(item => item.id === template.id);
  if (!saved) throw new Error('Falha ao salvar o modelo.');
  return saved;
}

export async function loadTemplateVersion({ workspaceId, versionId }: { workspaceId: string; versionId: string }) {
  const { data, error } = await getSupabaseClient().from('template_versions')
    .select('*').eq('id', versionId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const version = mapTemplateVersionRow(data);
  const urls = await resolveWorkspaceAssetMap(workspaceId, collectTemplateAssetIds([version]));
  return hydrateStyleAssets({ ...version.styleState, id: version.templateId, templateVersionId: version.id }, urls);
}
