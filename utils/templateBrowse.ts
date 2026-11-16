import type { MenuStyle } from '../types';

export type TemplateTab = 'all' | 'favorites' | 'mine';
export const TEMPLATE_TABS: [TemplateTab, string][] = [
  ['all', 'Todos'], ['favorites', 'Favoritos'], ['mine', 'Meus modelos'],
];

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function filterTemplates(templates: MenuStyle[], tab: TemplateTab, query: string, favorites: ReadonlySet<string>) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return templates.filter((template) => {
    if (tab === 'favorites' && !favorites.has(template.id)) return false;
    if (tab === 'mine' && template.scope === 'system') return false;
    const info = template.catalogMetadata;
    const index = normalize([template.name, info?.description, info?.category, template.fontFamily,
      ...(info?.tags || []), ...(info?.keywords || []), template.scope !== 'system' ? 'Importado Meus modelos' : 'Modelo pronto'].join(' '));
    return words.every((word) => index.includes(word));
  });
}

export function stepTemplate(templates: MenuStyle[], focused: string | undefined, delta: number) {
  if (!templates.length) return undefined;
  const index = templates.findIndex((template) => template.id === focused);
  return templates[index < 0 ? 0 : Math.max(0, Math.min(templates.length - 1, index + delta))].id;
}

export const swipeDirection = (dx: number, dy: number) =>
  Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.2 ? (dy < 0 ? 1 : -1) : 0;
