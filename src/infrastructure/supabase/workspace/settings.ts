import { getSupabaseClient } from '../client';
import { mapProfileRow, mapWorkspaceRow } from './rowMapping';

export const updateAccountIdentity = async ({
  userId,
  workspaceId,
  fullName,
  workspaceName,
}: {
  userId: string;
  workspaceId: string;
  fullName: string;
  workspaceName: string;
}) => {
  const supabase = getSupabaseClient();
  const normalizedFullName = fullName.trim();
  const normalizedWorkspaceName = workspaceName.trim();

  if (!normalizedFullName || !normalizedWorkspaceName) {
    throw new Error('Preencha o nome do responsável e do restaurante.');
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: normalizedFullName })
    .eq('user_id', userId);

  if (profileError) throw profileError;

  const { error: workspaceError } = await supabase
    .from('workspaces')
    .update({ name: normalizedWorkspaceName })
    .eq('id', workspaceId);

  if (workspaceError) throw workspaceError;

  return { fullName: normalizedFullName, workspaceName: normalizedWorkspaceName };
};

export const updateWorkspaceRuleSettings = async ({
  workspaceId,
  splitCategoryAcrossPages,
  productsCanChangeCategory,
}: {
  workspaceId: string;
  splitCategoryAcrossPages: boolean;
  productsCanChangeCategory: boolean;
}) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('workspaces')
    .update({
      settings: {
        split_category_across_pages: splitCategoryAcrossPages,
        productsCanChangeCategory,
      },
    })
    .eq('id', workspaceId);

  if (error) throw error;

  return { splitCategoryAcrossPages, productsCanChangeCategory };
};

export const updateAccountSettings = async ({
  userId,
  workspaceId,
  fullName,
  workspaceName,
  splitCategoryAcrossPages,
  productsCanChangeCategory,
}: {
  userId: string;
  workspaceId: string;
  fullName: string;
  workspaceName: string;
  splitCategoryAcrossPages: boolean;
  productsCanChangeCategory: boolean;
}) => {
  const supabase = getSupabaseClient();
  const normalizedFullName = fullName.trim();
  const normalizedWorkspaceName = workspaceName.trim();

  if (!normalizedFullName || !normalizedWorkspaceName) {
    throw new Error('Preencha o nome do responsável e do restaurante.');
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: normalizedFullName })
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (profileError) throw profileError;

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from('workspaces')
    .update({
      name: normalizedWorkspaceName,
      settings: { 
        split_category_across_pages: splitCategoryAcrossPages,
        productsCanChangeCategory: productsCanChangeCategory
      },
    })
    .eq('id', workspaceId)
    .select('*')
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!profileRow || !workspaceRow) {
      throw new Error("Não foi possível salvar as configurações. Tente recarregar a página.");
  }

  return {
    profile: mapProfileRow(profileRow),
    workspace: mapWorkspaceRow(workspaceRow),
  };
};
