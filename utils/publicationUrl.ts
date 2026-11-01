import type { MenuPublication } from '../types';

export const getPublicationUrl = (publication: MenuPublication, origin = window.location.origin) => {
  const path = `/cardapio/${encodeURIComponent(publication.restaurantSlug)}/${encodeURIComponent(publication.menuSlug)}`;
  if (!publication.portableSnapshotUrl) return `${origin}${path}`;
  const query = new URLSearchParams({ source: publication.portableSnapshotUrl });
  return `${origin}${path}?${query.toString()}`;
};
