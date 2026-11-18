import { type FavoriteCache, emptyFavoriteCache } from '../../application/templates/favoriteQueue';

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
