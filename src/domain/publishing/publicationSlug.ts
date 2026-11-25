export const normalizePublicationSlug = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const getDefaultPublicationSlug = (name: string, id: string) =>
  `${normalizePublicationSlug(name) || 'cardapio'}-${id.slice(0, 8)}`;
