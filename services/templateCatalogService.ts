import { getSupabaseClient } from './supabaseClient';

export type FavoriteCache = { confirmed: string[]; pending: Record<string, boolean> };

export function visibleFavorites(cache: FavoriteCache) {
  const result = new Set(cache.confirmed);
  Object.entries(cache.pending).forEach(([id, on]) => on ? result.add(id) : result.delete(id));
  return result;
}

export const emptyFavoriteCache = (): FavoriteCache => ({ confirmed: [], pending: {} });
const storageKey = (userId: string) => 'automenu:template-favorites:' + userId;

export function readFavoriteCache(userId: string): FavoriteCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null') as FavoriteCache | null;
    if (parsed && Array.isArray(parsed.confirmed) && parsed.pending && typeof parsed.pending === 'object') {
      return {
        confirmed: parsed.confirmed.filter((id) => typeof id === 'string'),
        pending: Object.fromEntries(Object.entries(parsed.pending).filter(([, value]) => typeof value === 'boolean')),
      };
    }
  } catch { /* Storage can be disabled. */ }
  return emptyFavoriteCache();
}

export function writeFavoriteCache(userId: string, cache: FavoriteCache) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(cache)); } catch { /* In-memory cache still works. */ }
}

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

export function settleFavorite(cache: FavoriteCache, id: string, sent: boolean, succeeded: boolean): FavoriteCache {
  const confirmed = new Set(cache.confirmed);
  if (succeeded) {
    if (sent) confirmed.add(id);
    else confirmed.delete(id);
  }
  const pending = { ...cache.pending };
  if (pending[id] === sent) delete pending[id];
  return { confirmed: [...confirmed], pending };
}

export const isPermanentFavoriteError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === '42501' || code === '23503' || code === '22P02';
};
