import type { Json } from './model';
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
export function canonicalize(input: unknown, depth = 0): string {
    if (depth > 64)
        throw new Error('Documento excede a profundidade permitida.');
    if (input === null || typeof input === 'boolean' || typeof input === 'string')
        return JSON.stringify(input);
    if (typeof input === 'number' && Number.isFinite(input))
        return JSON.stringify(input);
    if (Array.isArray(input))
        return `[${input.map(value => canonicalize(value, depth + 1)).join(',')}]`;
    if (input && typeof input === 'object')
        return `{${Object.keys(input).sort().filter(key => (input as any)[key] !== undefined).map(key => {
            if (unsafe.has(key))
                throw new Error('Chave de documento inválida.');
            return `${JSON.stringify(key)}:${canonicalize((input as any)[key], depth + 1)}`;
        }).join(',')}}`;
    throw new Error('Documento contém valor não serializável.');
}
/** Only volatile URLs paired with immutable IDs are stripped; arbitrary object IDs/order stay intact. */
export function persistentDocument(value: Json, root = true): Json {
    if (Array.isArray(value))
        return value.map(v => persistentDocument(v, false));
    if (!value || typeof value !== 'object') {
        if (typeof value === 'string' && /^data:/i.test(value))
            throw new Error('Recurso embutido precisa ser migrado antes do checkpoint.');
        return value;
    }
    const pairs: Record<string, string> = { imageAssetId: 'image', backgroundAssetId: 'backgroundImage', sourceAssetId: 'sourceImage', assetId: 'url' };
    const omit = new Set(Object.keys(pairs).filter(key => typeof value[key] === 'string' && value[key]).map(key => pairs[key]));
    if (value.shape && typeof value.shape === 'object')
        omit.add('url');
    return Object.fromEntries(Object.entries(value).filter(([key]) => !omit.has(key) && !(root && key === 'savedAt')).map(([key, v]) => [key, persistentDocument(v, false)]));
}
