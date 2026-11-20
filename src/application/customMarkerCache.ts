import type { CustomMenuMarker } from '../domain/menu/model';

export interface CustomMarkerCache {
  confirmed: CustomMenuMarker[];
  pending: Record<string, CustomMenuMarker | null>;
}

export function visibleCustomMarkers(cache: CustomMarkerCache) {
  const markers = new Map(cache.confirmed.map(marker => [marker.id, marker]));
  for (const [id, marker] of Object.entries(cache.pending)) {
    if (marker) markers.set(id, marker);
    else markers.delete(id);
  }
  return [...markers.values()];
}
