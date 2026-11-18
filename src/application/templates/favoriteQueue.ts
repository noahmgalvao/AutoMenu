export type FavoriteCache = { confirmed: string[]; pending: Record<string, boolean> };

export interface TemplateFavoritesGateway {
  fetchFavorites(userId: string): Promise<string[]>;
  persistFavorite(userId: string, templateId: string, selected: boolean): Promise<void>;
  isPermanentFavoriteError(error: unknown): boolean;
  readFavoriteCache(userId: string): FavoriteCache;
  writeFavoriteCache(userId: string, cache: FavoriteCache): void;
}

export function visibleFavorites(cache: FavoriteCache) {
  const result = new Set(cache.confirmed);
  Object.entries(cache.pending).forEach(([id, on]) => on ? result.add(id) : result.delete(id));
  return result;
}

export const emptyFavoriteCache = (): FavoriteCache => ({ confirmed: [], pending: {} });

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
