import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlobStore } from '../src/application/revisions/contracts';
import type { BlobLocator } from '../src/domain/revisions/model';
import { sha256 } from '../src/infrastructure/revisions/codec';
import { SupabaseBlobStore, BlobStores } from '../src/infrastructure/revisions/blobStore';
import { migrationManifest, reconcileManifest, copyAndVerify, cutoverVerified, rollbackMigration, type LocatorRepository } from '../src/application/revisions/providerMigration';
class MemoryStore implements BlobStore {
    readonly data = new Map<string, Uint8Array>();
    constructor(readonly providerId: string) { }
    planImmutable(namespace: string, key: string, byteLength: number, checksum: string): BlobLocator { return { id: checksum, namespace, provider_id: this.providerId, bucket: 'private', object_key: `${namespace}/${key}`, byte_length: byteLength, checksum, generation: 1 }; }
    async putImmutable(namespace: string, key: string, bytes: Uint8Array, checksum: string) {
        assert.equal(sha256(bytes), checksum);
        const id = `${namespace}/${key}`, previous = this.data.get(id);
        if (previous)
            assert.deepEqual(previous, bytes);
        else
            this.data.set(id, bytes.slice());
        return { id: checksum, namespace, provider_id: this.providerId, bucket: 'private', object_key: id, byte_length: bytes.length, checksum, generation: 1 };
    }
    async get(l: BlobLocator) {
        const data = this.data.get(l.object_key);
        if (!data)
            throw new Error('missing');
        assert.equal(sha256(data), l.checksum);
        return data;
    }
    async head(l: BlobLocator) { const bytes = await this.get(l); return { size: bytes.length, checksum: sha256(bytes), available: true }; }
    async remove(l: BlobLocator, g: number) {
        if (g !== l.generation)
            throw new Error('generation');
        this.data.delete(l.object_key);
    }
    async createReadAccess(l: BlobLocator, _ttl: number, auth: {
        namespace: string;
    }) {
        if (l.namespace !== auth.namespace)
            throw new Error('Unauthorized');
        return this.get(l);
    }
}
class FileStore extends MemoryStore {
    constructor(readonly directory: string) { super('local-test-only'); }
    override async putImmutable(n: string, k: string, b: Uint8Array, h: string) { const l = await super.putImmutable(n, k, b, h); await mkdir(join(this.directory, n), { recursive: true }); await writeFile(join(this.directory, l.object_key), b); return l; }
    override async get(l: BlobLocator) { const bytes = new Uint8Array(await readFile(join(this.directory, l.object_key))); assert.equal(sha256(bytes), l.checksum); return bytes; }
    override async remove(l: BlobLocator, g: number) { await super.remove(l, g); await rm(join(this.directory, l.object_key), { force: true }); }
}
async function contract(store: BlobStore) { const bytes = new TextEncoder().encode('Menu UTF-8: Açaí 🍔'), hash = sha256(bytes), planned = store.planImmutable('w', hash, bytes.length, hash), locator = await store.putImmutable('w', hash, bytes, hash); assert.deepEqual(locator, planned); assert.equal((await store.putImmutable('w', hash, bytes, hash)).checksum, hash); assert.deepEqual(await store.get(locator), bytes); assert.equal((await store.head(locator)).size, bytes.length); await assert.rejects(store.createReadAccess(locator, 300, { namespace: 'other' })); await assert.rejects(store.remove(locator, 2)); await store.remove(locator, 1); await store.remove(locator, 1); await assert.rejects(store.get(locator)); }
test('BlobStore contracts on two isolated test adapters and Supabase adapter with mocked HTTP/storage SDK', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'automenu-contract-'));
    try {
        await contract(new MemoryStore('memory'));
        await contract(new FileStore(temp));
    }
    finally {
        await rm(temp, { recursive: true, force: true });
    }
    const memory = new Map<string, Uint8Array>();
    const client = { storage: { from: (bucket: string) => ({ upload: async (key: string, bytes: Uint8Array, options: any) => {
                    assert.equal(options.upsert, false);
                    if (memory.has(`${bucket}/${key}`))
                        return { error: { statusCode: '409', message: 'already exists' } };
                    memory.set(`${bucket}/${key}`, bytes.slice());
                    return { error: null };
                }, download: async (key: string) => { const bytes = memory.get(`${bucket}/${key}`); return bytes ? { data: new Blob([bytes as any]), error: null } : { data: null, error: new Error('missing') }; }, remove: async (keys: string[]) => { keys.forEach(key => memory.delete(`${bucket}/${key}`)); return { error: null }; }, createSignedUrl: async (key: string, ttl: number) => { assert.ok(ttl <= 300); return { data: { signedUrl: `private:${key}` }, error: null }; } }) } };
    await contract(new SupabaseBlobStore(client as any));
});
test('provider migration supports dual locations, resumability, bad checksum, CAS conflicts and rollback without deleting sources', async () => {
    const source = new MemoryStore('old'), target = new MemoryStore('new'), locators = [];
    for (let i = 0; i < 3; i++) {
        const bytes = new TextEncoder().encode(`document${i}`);
        locators.push(await source.putImmutable('w', sha256(bytes), bytes, sha256(bytes)));
    }
    const active = new Map(locators.map(l => [l.id, l])), alternatives = new Map<string, BlobLocator>();
    let updates = 0;
    const repository: LocatorRepository = { recordAlternative: async (a, b) => { alternatives.set(a.id, b); }, cutover: async (a, b) => {
            const current = active.get(a.id)!;
            if (current.generation !== a.generation || current.provider_id !== a.provider_id)
                return false;
            active.set(a.id, { ...b, id: a.id, generation: a.generation + 1 });
            return true;
        } };
    const manifest = migrationManifest(locators, 'old', 'new');
    await assert.rejects(copyAndVerify(manifest, source, target, repository, async () => {
        if (++updates === 1)
            throw new Error('interruption');
    }), /interruption/);
    assert.equal(source.data.size, 3);
    await copyAndVerify(manifest, source, target, repository, async () => { });
    assert.equal(alternatives.size, 3);
    assert.equal(target.data.size, 3);
    await copyAndVerify(manifest, source, target, repository, async () => { });
    assert.equal(target.data.size, 3);
    assert.deepEqual(await cutoverVerified(manifest, repository), { conflicts: [] });
    const registry = new BlobStores('new', new Map([['old', source], ['new', target]]));
    for (const l of active.values())
        assert.equal((await registry.get(l.provider_id).head(l)).checksum, l.checksum);
    assert.deepEqual(await rollbackMigration(manifest, repository), { conflicts: [] });
    assert.equal(source.data.size, 3);
    assert.deepEqual((await cutoverVerified(manifest, repository)).conflicts.sort(), locators.map(l => l.id).sort());
    const broken = new MemoryStore('broken');
    broken.head = async () => ({ available: true, size: 999, checksum: 'bad' });
    await assert.rejects(copyAndVerify(migrationManifest(locators, 'old', 'broken'), source, broken, repository, async () => { }), /Verificação/);
    assert.equal(source.data.size, 3);
});
test('reconciling a manifest after cutover preserves rollback entries and rejects another migration', () => { const locator = { id: 'b', namespace: 'w', provider_id: 'old', bucket: 'private', object_key: 'key', byte_length: 10, checksum: 'a'.repeat(64), generation: 1 }; const manifest = migrationManifest([locator], 'old', 'new'); assert.equal(reconcileManifest(manifest, [], 'old', 'new').entries.length, 1); assert.throws(() => reconcileManifest(manifest, [], 'new', 'third')); assert.throws(() => reconcileManifest(manifest, [{ ...locator, checksum: 'b'.repeat(64) }], 'old', 'new')); });
