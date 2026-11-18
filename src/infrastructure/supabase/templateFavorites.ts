import { getSupabaseClient } from './client';

export async function fetchFavorites(userId: string) {
  const { data, error } = await getSupabaseClient().from('template_favorites').select('template_id').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => row.template_id as string);
}

export async function persistFavorite(userId: string, templateId: string, on: boolean) {
  const favorites = getSupabaseClient().from('template_favorites');
  const { error } = on
    ? await favorites.upsert({ user_id: userId, template_id: templateId }, { onConflict: 'user_id,template_id', ignoreDuplicates: true })
    : await favorites.delete().eq('user_id', userId).eq('template_id', templateId);
  if (error) throw error;
}

export const isPermanentFavoriteError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === '42501' || code === '23503' || code === '22P02';
};
