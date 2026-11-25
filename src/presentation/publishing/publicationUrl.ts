import type { MenuPublication } from '../../domain/workspace/model';

export const getPublicationUrl = ({ restaurantSlug, menuSlug }: MenuPublication, origin = window.location.origin) =>
  `${origin}/cardapio/${encodeURIComponent(restaurantSlug)}/${encodeURIComponent(menuSlug)}`;

export const getShareablePublicationUrl = (publication: MenuPublication) => {
  const address = getPublicationUrl(publication);
  if (!publication.portableSnapshotUrl) return address;
  const query = new URLSearchParams({ source: publication.portableSnapshotUrl });
  return `${address}?${query.toString()}`;
};
