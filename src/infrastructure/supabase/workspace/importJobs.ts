import { getSupabaseClient } from '../client';

export const createAiImportJob = async ({
  workspaceId,
  sourceAssetId,
  createdTemplateId,
  createdMenuId,
  normalizedResult,
}: {
  workspaceId: string;
  sourceAssetId: string | null;
  createdTemplateId?: string | null;
  createdMenuId?: string | null;
  normalizedResult: Record<string, unknown>;
}) => {
  const supabase = getSupabaseClient();
  const payload = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    source_asset_id: sourceAssetId,
    status: 'completed',
    provider: 'google',
    model: 'gemini-2.5-flash',
    raw_response: normalizedResult,
    normalized_result: normalizedResult,
    created_template_id: createdTemplateId || null,
    created_menu_id: createdMenuId || null,
  };

  const { error } = await supabase.from('ai_import_jobs').insert(payload);
  if (error) {
    throw error;
  }
};
