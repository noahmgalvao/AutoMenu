import type { MenuPublication } from '../../domain/workspace/model';

const getPortablePublicationStorageKey = (menuId: string) => `automenu:portable-publication:${menuId}`;

export const readPortablePublication = (menuId: string): MenuPublication | null => {
  try {
    const stored = window.localStorage.getItem(getPortablePublicationStorageKey(menuId));
    if (!stored) return null;
    const publication = JSON.parse(stored) as MenuPublication;
    return publication.menuId === menuId && publication.portableSnapshotUrl ? publication : null;
  } catch {
    return null;
  }
};

export const readPortablePublicationBySlug = (restaurantSlug: string, menuSlug: string): MenuPublication | null => {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith('automenu:portable-publication:')) continue;
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const publication = JSON.parse(stored) as MenuPublication;
      if (
        publication.restaurantSlug === restaurantSlug
        && publication.menuSlug === menuSlug
        && publication.portableSnapshotUrl
      ) return publication;
    }
  } catch {
    return null;
  }
  return null;
};

export const savePortablePublication = (publication: MenuPublication) => {
  try {
    window.localStorage.setItem(getPortablePublicationStorageKey(publication.menuId), JSON.stringify(publication));
  } catch {
    // The public link still works even when local preference storage is unavailable.
  }
};
