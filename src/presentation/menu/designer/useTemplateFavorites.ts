import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { settleFavorite, visibleFavorites, type FavoriteCache } from '../../../application/templates/favoriteQueue';
import { useAppServices } from '../../app/AppServicesProvider';

export function useTemplateFavorites(userId: string) {
  const { favorites: { fetchFavorites, isPermanentFavoriteError, persistFavorite, readFavoriteCache, writeFavoriteCache } } = useAppServices();
  const session = useMemo(() => ({
    cache: readFavoriteCache(userId),
    active: false,
    loaded: false,
    running: false,
    refreshRequested: false,
    retryDelay: 3000,
    timer: undefined as number | undefined,
  }), [readFavoriteCache, userId]);
  const [, refreshView] = useReducer((version) => version + 1, 0);
  const [announcement, setAnnouncement] = useState('');

  const update = useCallback((cache: FavoriteCache) => {
    session.cache = cache;
    writeFavoriteCache(userId, cache);
    if (session.active) refreshView();
  }, [session, userId, writeFavoriteCache]);

  const sync = useCallback(async (refresh = false) => {
    session.refreshRequested ||= refresh;
    if (!userId || !session.active || session.running || !navigator.onLine) return;
    session.running = true;
    window.clearTimeout(session.timer);
    let needsRetry = false;
    try {
      if (session.refreshRequested || !session.loaded) {
        session.refreshRequested = false;
        try {
          const confirmed = await fetchFavorites(userId);
          if (!session.active) return;
          update({ ...session.cache, confirmed });
          session.loaded = true;
        } catch {
          session.loaded = false;
          needsRetry = true;
        }
      }

      const failed = new Set<string>();
      while (session.active && navigator.onLine) {
        const next = Object.entries(session.cache.pending).find(([id]) => !failed.has(id));
        if (!next) break;
        const [id, on] = next;
        try {
          await persistFavorite(userId, id, on);
          if (session.active) update(settleFavorite(session.cache, id, on, true));
        } catch (error) {
          failed.add(id);
          needsRetry = true;
          if (isPermanentFavoriteError(error)) session.retryDelay = Math.max(30000, session.retryDelay);
        }
      }
    } finally {
      session.running = false;
      if (session.active && navigator.onLine && (needsRetry || session.refreshRequested)) {
        session.timer = window.setTimeout(() => void sync(), session.refreshRequested ? 0 : session.retryDelay);
        session.retryDelay = Math.min(60000, session.retryDelay * 2);
      } else session.retryDelay = 3000;
    }
  }, [fetchFavorites, isPermanentFavoriteError, persistFavorite, session, update, userId]);

  useEffect(() => {
    session.active = true;
    const reconnect = () => {
      session.retryDelay = 3000;
      void sync(true);
    };
    const focus = () => void sync(true);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', focus);
    reconnect();
    return () => {
      session.active = false;
      window.clearTimeout(session.timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', focus);
    };
  }, [session, sync]);

  return {
    ids: visibleFavorites(session.cache), announcement,
    toggle(id: string, name: string) {
      const on = !visibleFavorites(session.cache).has(id);
      update({ ...session.cache, pending: { ...session.cache.pending, [id]: on } });
      setAnnouncement(name + (on ? ' adicionado aos favoritos.' : ' removido dos favoritos.'));
      void sync();
    },
  };
}
