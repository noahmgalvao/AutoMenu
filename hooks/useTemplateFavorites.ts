import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchFavorites, isPermanentFavoriteError, persistFavorite, readFavoriteCache,
  settleFavorite, visibleFavorites, writeFavoriteCache, type FavoriteCache,
} from '../services/templateCatalogService';

export function useTemplateFavorites(userId: string) {
  const state = useRef(readFavoriteCache(userId));
  const [cache, setCache] = useState(state.current);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const [announcement, setAnnouncement] = useState('');
  const running = useRef(false);
  const active = useRef(false);
  const loaded = useRef(false);
  const rejected = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback((next: FavoriteCache) => {
    state.current = next;
    writeFavoriteCache(userId, next);
    if (active.current) setCache(next);
  }, [userId]);

  const sync = useCallback(async (refresh = false) => {
    if (running.current || !active.current) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    running.current = true;
    clearTimeout(timer.current);
    try {
      if (refresh || !loaded.current) {
        const confirmed = await fetchFavorites(userId);
        update({ ...state.current, confirmed });
        loaded.current = true;
      }
      while (active.current) {
        const entry = Object.entries(state.current.pending)[0];
        if (!entry) break;
        const [id, on] = entry;
        try {
          await persistFavorite(userId, id, on);
          update(settleFavorite(state.current, id, on, true));
        } catch (error) {
          if (!isPermanentFavoriteError(error)) throw error;
          rejected.current = true;
          update(settleFavorite(state.current, id, on, false));
          if (active.current) setAnnouncement('O favorito não pôde ser alterado.');
        }
      }
      if (active.current) setStatus(rejected.current ? 'error' : 'ready');
    } catch {
      if (active.current) {
        setStatus('offline');
        timer.current = setTimeout(() => void sync(true), 15000);
      }
    } finally {
      running.current = false;
    }
  }, [update, userId]);

  useEffect(() => {
    active.current = true;
    const online = () => void sync(true);
    const offline = () => setStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    online();
    return () => {
      active.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [sync]);

  return {
    ids: useMemo(() => visibleFavorites(cache), [cache]), status, announcement,
    retry: () => { rejected.current = false; void sync(true); },
    toggle(id: string, name: string) {
      const on = !visibleFavorites(state.current).has(id);
      rejected.current = false;
      update({ ...state.current, pending: { ...state.current.pending, [id]: on } });
      setAnnouncement(name + (on ? ' adicionado aos favoritos.' : ' removido dos favoritos.'));
      void sync();
    },
  };
}
