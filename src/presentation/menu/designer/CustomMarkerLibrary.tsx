import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CustomMenuMarker } from '../../../domain/menu/model';
import { useAppServices } from '../../app/AppServicesProvider';

interface MarkerLibrary {
  markers: CustomMenuMarker[];
  ready: boolean;
  pending: boolean;
  error: string;
  load: () => void;
  save: (marker: CustomMenuMarker, onError: () => void) => boolean;
  remove: (id: string, onSuccess: () => void) => void;
}

export const CustomMarkerLibrary = createContext<MarkerLibrary | null>(null);

export function CustomMarkerLibraryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { customMarkers: { listCustomMenuMarkers, saveCustomMenuMarker, deleteCustomMenuMarker } } = useAppServices();
  const [markers, setMarkers] = useState<CustomMenuMarker[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const load = useCallback(() => {
    if (!userId || ready || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    void listCustomMenuMarkers(userId).then(items => {
      setMarkers(items);
      setReady(true);
    }).catch(() => setError('Não foi possível carregar seus marcadores.')).finally(() => {
      busy.current = false;
      setPending(false);
    });
  }, [listCustomMenuMarkers, ready, userId]);

  // The palette is account data and is loaded only when a marker editor requests it.
  const value: MarkerLibrary = {
    markers, ready, pending, error, load,
    save(marker, onError) {
      if (!ready || busy.current) return false;
      busy.current = true;
      setPending(true);
      setError('');
      setMarkers(items => [...items, marker]);
      void saveCustomMenuMarker(userId, marker).catch(() => {
        setMarkers(items => items.filter(item => item.id !== marker.id));
        setError('Não foi possível salvar o marcador. Tente novamente.');
        onError();
      }).finally(() => {
        busy.current = false;
        setPending(false);
      });
      return true;
    },
    remove(id, onSuccess) {
      if (!ready || busy.current) return;
      busy.current = true;
      setPending(true);
      setError('');
      void deleteCustomMenuMarker(userId, id).then(() => {
        setMarkers(items => items.filter(item => item.id !== id));
        onSuccess();
      }).catch(() => setError('Não foi possível remover o marcador. Tente novamente.')).finally(() => {
        busy.current = false;
        setPending(false);
      });
    },
  };
  return <CustomMarkerLibrary.Provider value={value}>{children}</CustomMarkerLibrary.Provider>;
}

export function useLoadCustomMarkerLibrary(library: MarkerLibrary | null) {
  const load = library?.load;
  useEffect(() => { load?.(); }, [load]);
}
