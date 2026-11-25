import type { MenuPublication } from '../../domain/workspace/model';

export const getPublicationPrefix = (restaurantSlug: string, origin = window.location.origin) =>
  `${origin}/cardapio/${encodeURIComponent(restaurantSlug)}/`;

export const getPublicationUrl = (publication: MenuPublication, origin = window.location.origin) => {
  const address = `${getPublicationPrefix(publication.restaurantSlug, origin)}${encodeURIComponent(publication.menuSlug)}`;
  if (!publication.portableSnapshotUrl) return address;
  const query = new URLSearchParams({ source: publication.portableSnapshotUrl });
  return `${address}?${query.toString()}`;
};
