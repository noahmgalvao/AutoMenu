import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlobStore } from '../src/application/revisions/contracts';
import type { BlobLocator } from '../src/domain/revisions/model';
import { revisionDatabase, ACTOR } from './support/revisionDatabase';
import { revisionPostgrest } from './support/revisionPostgrest';
import { RevisionRepository } from '../src/infrastructure/revisions/repository';
import { RevisionService, editorOf } from '../src/infrastructure/revisions/service';
import { BlobStores } from '../src/infrastructure/revisions/blobStore';
import { sha256 } from '../src/infrastructure/revisions/codec';
class FixtureBlobs implements BlobStore {
    readonly providerId = 'fixture';
    readonly objects = new Map<string, Uint8Array>();
    planImmutable(namespace: string, key: string, byte_length: number, checksum: string): BlobLocator { return { id: checksum, namespace, provider_id: this.providerId, bucket: 'fixture-private', object_key: `opaque/${namespace}/${key}`, byte_length, checksum, generation: 1 }; }
    async putImmutable(n: string, k: string, b: Uint8Array, h: string) { assert.equal(sha256(b), h); const l = this.planImmutable(n, k, b.length, h); this.objects.set(l.object_key, b.slice()); return l; }
    async get(l: BlobLocator) { const bytes = this.objects.get(l.object_key); if (!bytes)
        throw new Error('Missing fixture blob'); assert.equal(sha256(bytes), l.checksum); return bytes; }
    async head(l: BlobLocator) { const b = await this.get(l); return { size: b.length, checksum: sha256(b), available: true }; }
    async remove(l: BlobLocator, g: number) { assert.equal(g, l.generation); this.objects.delete(l.object_key); }
    async createReadAccess(l: BlobLocator, _ttl: number, a: {
        namespace: string;
    }) { assert.equal(l.namespace, a.namespace); return this.get(l); }
}
test('production service + repository integrate with PostgreSQL: migration, opaque locators, CAS saves, manual retry, restoration and copy', async () => {
    const db = await revisionDatabase();
    try {
        const client = revisionPostgrest(db), store = new FixtureBlobs(), repo = new RevisionRepository(client as any, new BlobStores('fixture', new Map([['fixture', store]]))), service = new RevisionService(repo);
        assert.equal(await service.migrateBatch('m', ACTOR), true);
        assert.equal((await repo.page('m', 'all')).items.length, 1);
        const document = (n: number) => ({ products: [{ id: 'p', category: 'Categoria', name: `Produto ${n}`, description: 'Ingredientes', price: n }], style: { menuTitle: 'Cardápio' }, sortOption: { field: 'name', direction: 'asc' } });
        const saved = await service.save('m', ACTOR, { expectedWrite: 0, operationId: 'save1', snapshot: document(1), editor: editorOf(document(1)) });
        assert.equal(saved.menu.revision_write_version, 1);
        const manual = await repo.checkpoint('m', ACTOR, 'manual1', { manual: true, name: 'Versão 1', defaultName: true, expectedWrite: 1 });
        assert.equal(manual.name, 'Versão 1');
        await service.save('m', ACTOR, { expectedWrite: 1, operationId: 'save2', snapshot: document(2), editor: editorOf(document(2)) });
        assert.equal((await repo.checkpoint('m', ACTOR, 'manual1', { manual: true, name: 'Other', expectedWrite: 1 })).id, manual.id);
        await assert.rejects(repo.checkpoint('m', ACTOR, 'stale-manual', { manual: true, name: 'Stale', expectedWrite: 1 }), /Conflito/);
        const original = (await repo.page('m', 'protected')).items.find(r => r.protection === 'original')!;
        await service.restore('m', ACTOR, original.id, 2, 'restore1');
        assert.equal((await repo.current('m')).menu.revision_write_version, 3);
        const copied = await service.copy('m', ACTOR, manual.id, 'copy1');
        assert.ok(copied.menuId);
        assert.equal((await repo.page(copied.menuId, 'all')).items.length, 1);
        assert.deepEqual((await repo.current(copied.menuId)).document, document(1));
        await service.save('m', ACTOR, { expectedWrite: 3, operationId: 'save3', snapshot: document(3), editor: editorOf(document(3)) });
        await db.exec("update public.revision_jobs set due_at=now()-interval '1 second'");
        assert.equal((await service.runJobs(10)).completed, 1);
        await db.exec('update public.revision_config set capacity_level=95');
        const underPressure = await service.save('m', ACTOR, { expectedWrite: 4, operationId: 'save4', snapshot: document(4), editor: editorOf(document(4)) });
        assert.equal(underPressure.menu.revision_write_version, 5);
        assert.ok(underPressure.historyWarning);
        await assert.rejects(repo.checkpoint('m', ACTOR, 'pressure-manual', { manual: true, name: 'Blocked', expectedWrite: 5 }), /capacidade/);
        assert.equal((await repo.runtime('m')).manual_counter, 1);
        assert.ok([...store.objects.keys()].every(key => key.startsWith('opaque/w/')));
        const blobRows = await db.query<{
            bucket: string;
        }>('select distinct bucket from public.revision_blobs');
        assert.deepEqual(blobRows.rows, [{ bucket: 'fixture-private' }]);
    }
    finally {
        await db.close();
    }
});
