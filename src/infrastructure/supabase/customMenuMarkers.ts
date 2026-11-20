import type { CustomMenuMarker } from '../../domain/menu/model';
import { getSupabaseClient } from './client';

export async function listCustomMenuMarkers(userId: string): Promise<CustomMenuMarker[]> {
  const { data, error } = await getSupabaseClient().from('custom_menu_markers')
    .select('id,shape').eq('user_id', userId).order('created_at').order('id');
  if (error) throw error;
  return data || [];
}

export async function saveCustomMenuMarker(userId: string, marker: CustomMenuMarker) {
  const { error } = await getSupabaseClient().from('custom_menu_markers')
    .upsert({ user_id: userId, ...marker }, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function deleteCustomMenuMarker(userId: string, id: string) {
  const { error } = await getSupabaseClient().from('custom_menu_markers').delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}
