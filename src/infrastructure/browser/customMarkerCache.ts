import type { CustomMarkerCache } from '../../application/customMarkerCache';

const key = (userId: string) => `automenu-custom-markers:${userId}`;

export function readCustomMarkerCache(userId: string): CustomMarkerCache {
  try {
    const cache = JSON.parse(localStorage.getItem(key(userId)) || 'null') as CustomMarkerCache | null;
    if (cache && Array.isArray(cache.confirmed) && cache.pending && typeof cache.pending === 'object') return cache;
  } catch { /* The remote library can still be loaded. */ }
  return { confirmed: [], pending: {} };
}

export function writeCustomMarkerCache(userId: string, cache: CustomMarkerCache) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}
