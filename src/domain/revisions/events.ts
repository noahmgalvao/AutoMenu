import type { Json } from './model';
export function classifyChange(previous: Json, next: Json, label = '') {
    const a = previous as any, b = next as any;
    const oldProducts = Array.isArray(a?.products) ? a.products : [], newProducts = Array.isArray(b?.products) ? b.products : [];
    const oldCategories = new Set(oldProducts.filter((p: any) => !p.isFreeText).map((p: any) => p.category));
    const newCategories = new Set(newProducts.filter((p: any) => !p.isFreeText).map((p: any) => p.category));
    if ([...oldCategories].some(c => !newCategories.has(c)))
        return 3;
    const removed = oldProducts.filter((p: any) => !newProducts.some((n: any) => n.id === p.id)).length;
    if (removed > 1 || /conflito|import|redefin|restaur|excluir página|remover página/i.test(label))
        return 3;
    if (/modelo|template|página|publica/i.test(label) || a?.style?.id !== b?.style?.id)
        return 2;
    return 0;
}
