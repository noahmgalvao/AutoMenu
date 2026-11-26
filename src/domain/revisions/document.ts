import type { Json } from './model';
import { canonicalize } from './canonical';
/** Structural abuse limits, independent of menu typography/layout preferences. */
export function validateRevisionDocument(document: Json): void {
    if (!document || Array.isArray(document) || typeof document !== 'object' || !Array.isArray(document.products) || !document.style || Array.isArray(document.style) || typeof document.style !== 'object')
        throw new Error('Documento de cardápio inválido.');
    if (document.products.length > 10000)
        throw new Error('Limite técnico de objetos excedido.');
    const ids = new Set<string>();
    for (const item of document.products) {
        if (!item || Array.isArray(item) || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.id.length > 200 || ids.has(item.id) || typeof item.name !== 'string' || typeof item.price !== 'number' || !Number.isFinite(item.price))
            throw new Error('Objeto de cardápio inválido.');
        ids.add(item.id);
    }
    const sort = document.sortOption;
    if (sort && (typeof sort !== 'object' || Array.isArray(sort) || !['name', 'price', 'category'].includes(String(sort.field)) || !['asc', 'desc'].includes(String(sort.direction))))
        throw new Error('Ordenação de cardápio inválida.');
    canonicalize(document);
}
