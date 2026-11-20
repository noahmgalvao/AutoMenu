import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { visibleCustomMarkers, type CustomMarkerCache } from '../../../application/customMarkerCache';
import type { CustomMenuMarker } from '../../../domain/menu/model';
import { useAppServices } from '../../app/AppServicesProvider';

interface MarkerLibrary {
  markers: CustomMenuMarker[];
  ready: boolean;
  load: () => void;
  save: (marker: CustomMenuMarker) => boolean;
  remove: (id: string, onSuccess: () => void) => void;
}

export const CustomMarkerLibrary = createContext<MarkerLibrary | null>(null);

export function CustomMarkerLibraryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const gateway = useAppServices().customMarkers;
  const session = useMemo(() => ({
    cache: gateway.readCustomMarkerCache(userId),
    active: false,
    running: false,
    requested: false,
    loaded: false,
    loadedOnce: false,
    retry: undefined as number | undefined,
  }), [gateway, userId]);
  const [markers, setMarkers] = useState(() => visibleCustomMarkers(session.cache));

  const update = useCallback((cache: CustomMarkerCache) => {
    session.cache = cache;
    gateway.writeCustomMarkerCache(userId, cache);
    if (session.active) setMarkers(visibleCustomMarkers(cache));
  }, [gateway, session, userId]);

  const sync = useCallback(async (refresh = false) => {
    session.requested ||= refresh;
    if (!userId || !session.active || session.running || !navigator.onLine) return;
    session.running = true;
    window.clearTimeout(session.retry);
    let needsRetry = false;
    try {
      if (!session.loaded || session.requested) {
        session.requested = false;
        try {
          const confirmed = await gateway.listCustomMenuMarkers(userId);
          update({ ...session.cache, confirmed });
          session.loaded = true;
        } catch {
          needsRetry = true;
        }
      }

      const failed = new Set<string>();
      while (session.active && navigator.onLine) {
        const entry = Object.entries(session.cache.pending).find(([id]) => !failed.has(id));
        if (!entry) break;
        const [id, marker] = entry;
        try {
          if (marker) await gateway.saveCustomMenuMarker(userId, marker);
          else await gateway.deleteCustomMenuMarker(userId, id);
          const pending = { ...session.cache.pending };
          if (pending[id] === marker) delete pending[id];
          const confirmed = session.cache.confirmed.filter(item => item.id !== id);
          if (marker) confirmed.push(marker);
          update({ confirmed, pending });
        } catch {
          failed.add(id);
          needsRetry = true;
        }
      }
    } finally {
      session.running = false;
      if (session.active && navigator.onLine && (needsRetry || session.requested)) {
        session.retry = window.setTimeout(() => void sync(), session.requested ? 0 : 15000);
      }
    }
  }, [gateway, session, update, userId]);

  useEffect(() => {
    session.active = true;
    const reconnect = () => { if (session.loadedOnce) void sync(true); };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    if (session.loadedOnce) void sync();
    return () => {
      session.active = false;
      window.clearTimeout(session.retry);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
    };
  }, [session, sync]);

  const load = useCallback(() => {
    session.loadedOnce = true;
    void sync();
  }, [session, sync]);

  const value: MarkerLibrary = {
    markers, load, ready: Boolean(userId),
    save(marker) {
      if (!userId) return false;
      update({ ...session.cache, pending: { ...session.cache.pending, [marker.id]: marker } });
      void sync();
      return true;
    },
    remove(id, onSuccess) {
      if (!userId) return;
      update({ ...session.cache, pending: { ...session.cache.pending, [id]: null } });
      onSuccess();
      void sync();
    },
  };
  return <CustomMarkerLibrary.Provider value={value}>{children}</CustomMarkerLibrary.Provider>;
}

export function useLoadCustomMarkerLibrary(library: MarkerLibrary | null) {
  const load = library?.load;
  useEffect(() => { load?.(); }, [load]);
}
