import { FREE_TEXT_PREFIX } from './flow';

// Most menus use the visible name as their grouping key. Copies also need an independent identity.
const instancePrefix = /^cat_instance_[a-f0-9-]{36}_/;

export const categoryName = (key: string) => key.replace(instancePrefix, '');

export const categoryInstanceSlug = (key: string) => instancePrefix.exec(key)?.[0].slice(0, -1);
export const storedCategoryKey = (row: { name: string; slug: string }) =>
    /^cat_instance_[a-f0-9-]{36}$/.test(row.slug) ? `${row.slug}_${row.name}` : row.name;

export function categoryKey(name: string, existing: Iterable<string>, previous?: string) {
    if (previous && categoryName(previous) === name) return previous;
    const taken = new Set(existing);
    const needsId = taken.has(name) || name.startsWith(FREE_TEXT_PREFIX) || instancePrefix.test(name) || Object.prototype.hasOwnProperty.call(Object.prototype, name);
    return needsId ? `cat_instance_${crypto.randomUUID()}_${name}` : name;
}
