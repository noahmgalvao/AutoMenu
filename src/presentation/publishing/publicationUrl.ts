import type { MenuPublication } from '../../domain/workspace/model';

export const getPublicationUrl = (publication: MenuPublication, origin = window.location.origin) => {
  const path = `/cardapio/${encodeURIComponent(publication.restaurantSlug)}/${encodeURIComponent(publication.menuSlug)}`;
  if (!publication.portableSnapshotUrl) return `${origin}${path}`;
  const query = new URLSearchParams({ source: publication.portableSnapshotUrl });
  return `${origin}${path}?${query.toString()}`;
};

export const getExpectedPublicationUrl = ({
  restaurantSlug,
  menuName,
  menuId,
  origin = window.location.origin,
}: {
  restaurantSlug: string;
  menuName: string;
  menuId: string;
  origin?: string;
}) => {
  const normalizedName = menuName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cardapio';
  const menuSlug = `${normalizedName}-${menuId.slice(0, 8)}`;
  return `${origin}/cardapio/${encodeURIComponent(restaurantSlug)}/${encodeURIComponent(menuSlug)}`;
};
