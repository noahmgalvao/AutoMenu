import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlobStore } from '../../application/revisions/contracts';
import type { BlobLocator } from '../../domain/revisions/model';
import { sha256 } from './codec';
export class SupabaseBlobStore implements BlobStore {
    constructor(private client: SupabaseClient, private bucket = 'revision-blobs', readonly providerId = 'supabase-v1') { }
    planImmutable(namespace: string, key: string, byteLength: number, checksum: string): BlobLocator {
        if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-zA-Z0-9_-]+$/.test(namespace) || key !== checksum || byteLength < 0)
            throw new Error('Blob inválido.');
        return { id: checksum, namespace, provider_id: this.providerId, bucket: this.bucket, object_key: `${namespace}/${key}`, byte_length: byteLength, checksum, generation: 1 };
    }
    async putImmutable(namespace: string, key: string, bytes: Uint8Array, checksum: string) {
        if (sha256(bytes) !== checksum || !/^[a-f0-9]{64}$/.test(key) || !/^[a-zA-Z0-9_-]+$/.test(namespace))
            throw new Error('Blob inválido.');
        const locator = this.planImmutable(namespace, key, bytes.length, checksum);
        const { error } = await this.client.storage.from(this.bucket).upload(locator.object_key, bytes, { upsert: false, contentType: 'application/octet-stream', cacheControl: 'private, max-age=0' });
        if (error && !/already exists|duplicate/i.test(error.message) && (error as any).statusCode !== '409')
            throw error;
        const actual = await this.get(locator);
        if (sha256(actual) !== checksum || actual.length !== bytes.length)
            throw new Error('Validação do upload falhou.');
        return locator;
    }
    async get(locator: BlobLocator) {
        if (locator.provider_id !== this.providerId)
            throw new Error('Provedor não configurado.');
        const { data, error } = await this.client.storage.from(locator.bucket).download(locator.object_key);
        if (error)
            throw error;
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (bytes.length !== locator.byte_length || sha256(bytes) !== locator.checksum)
            throw new Error('Checksum do objeto divergente.');
        return bytes;
    }
    async head(locator: BlobLocator) { const bytes = await this.get(locator); return { size: bytes.length, checksum: sha256(bytes), available: true }; }
    async remove(locator: BlobLocator, expectedGeneration: number) {
        if (expectedGeneration !== locator.generation)
            throw new Error('Geração alterada.');
        const { error } = await this.client.storage.from(locator.bucket).remove([locator.object_key]);
        if (error)
            throw error;
    }
    async createReadAccess(locator: BlobLocator, ttl: number, authorized: {
        namespace: string;
    }) {
        if (authorized.namespace !== locator.namespace)
            throw new Error('Acesso negado.');
        const { data, error } = await this.client.storage.from(locator.bucket).createSignedUrl(locator.object_key, Math.min(300, Math.max(1, ttl)));
        if (error)
            throw error;
        return data.signedUrl;
    }
}
export class BlobStores {
    constructor(readonly active: string, private providers: Map<string, BlobStore>) {
        if (!providers.has(active))
            throw new Error('Provedor ativo indisponível.');
    }
    get(provider: string) {
        const store = this.providers.get(provider);
        if (!store)
            throw new Error(`Provedor ${provider} indisponível.`);
        return store;
    }
    writer() { return this.get(this.active); }
}
