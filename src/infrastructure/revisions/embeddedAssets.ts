import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '../../domain/revisions/model';
import { sha256 } from './codec';
const resultOf = async (query: PromiseLike<any>) => {
    const { data, error } = await query;
    if (error)
        throw error;
    return data;
};
/** Lossless legacy externalization; never fetch arbitrary external URLs or transcode originals. */
export async function externalizeEmbeddedAssets(db: SupabaseClient, namespace: string, actor: string, document: Json): Promise<Json> {
    const visit = async (value: Json): Promise<Json> => {
        if (Array.isArray(value))
            return Promise.all(value.map(visit));
        if (value && typeof value === 'object') {
            const result = Object.fromEntries(await Promise.all(Object.entries(value).filter(([k]) => !(k === 'url' && value.shape)).map(async ([k, v]) => [k, await visit(v)])));
            for (const [url, id] of Object.entries({ image: 'imageAssetId', url: 'assetId', backgroundImage: 'backgroundAssetId', sourceImage: 'sourceAssetId' })) {
                const token = result[url];
                if (typeof token === 'string' && token.startsWith('asset://'))
                    result[id] = token.slice(8);
            }
            return result;
        }
        if (typeof value !== 'string' || !value.startsWith('data:'))
            return value;
        const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
        if (!match)
            throw new Error('Recurso legado inválido.');
        const mime = match[1].toLowerCase();
        if (!/^(image\/(png|jpeg|webp|gif|tiff|svg\+xml)|font\/(woff2?|ttf|otf))$/.test(mime))
            throw new Error(`Recurso embutido ${mime} exige migração de fidelidade verificada.`);
        const bytes = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
        if (bytes.length > 32 * 1024 * 1024)
            throw new Error('Recurso legado excede limite de upload.');
        const checksum = sha256(bytes);
        let asset = await resultOf(db.from('assets').select('id').eq('workspace_id', namespace).eq('checksum', checksum).eq('metadata->>immutable','true').limit(1).maybeSingle());
        if (!asset) {
            const id = sha256(`${namespace}:${checksum}`), path = `${namespace}/revision-assets/${checksum}`;
            const result = await db.storage.from('menu-assets').upload(path, bytes, { upsert: false, contentType: mime });
            if (result.error && !/already exists|duplicate/i.test(result.error.message))
                throw result.error;
            const stored = await resultOf(db.storage.from('menu-assets').download(path));
            if (sha256(new Uint8Array(await stored.arrayBuffer())) !== checksum)
                throw new Error('Checksum de recurso legado divergente.');
            asset = await resultOf(db.from('assets').upsert({ id, workspace_id: namespace, bucket: 'menu-assets', path, asset_type: 'added_image', mime_type: mime, size_bytes: bytes.length, checksum, created_by: actor, metadata: { immutable: true, revision_asset: true } }, { onConflict: 'id', ignoreDuplicates: true }).select('id').single());
        }
        return `asset://${asset.id}`;
    };
    return visit(document);
}
