import type { MenuPublication } from '../../domain/workspace/model';

export const getPublicationUrl = ({ restaurantSlug, menuSlug }: MenuPublication, origin = window.location.origin) =>
  `${origin}/cardapio/${encodeURIComponent(restaurantSlug)}/${encodeURIComponent(menuSlug)}`;
