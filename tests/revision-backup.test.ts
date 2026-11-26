import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { revisionDatabase } from './support/revisionDatabase';
import { sha256 } from '../src/infrastructure/revisions/codec';
test('isolated PostgreSQL directory dump and separate object manifest survive encrypted fixture backup/restore', async (t) => {
    const db = await revisionDatabase();
    const start = performance.now();
    let restored: PGlite | undefined;
    try {
        const dump = await db.dumpDataDir(), bytes = new Uint8Array(await dump.arrayBuffer());
        const objects = new Map([['private/object-a', new TextEncoder().encode('Original de impressão')], ['private/object-b', new Uint8Array([0, 1, 254, 255])]]);
        const manifest = { version: 1, database: { bytes: bytes.length, checksum: sha256(bytes) }, objects: [...objects].map(([key, data]) => ({ key, bytes: data.length, checksum: sha256(data) })) };
        const key = randomBytes(32), iv = randomBytes(12), encrypt = createCipheriv('aes-256-gcm', key, iv), encrypted = Buffer.concat([encrypt.update(bytes), encrypt.final()]), tag = encrypt.getAuthTag();
        const decrypt = createDecipheriv('aes-256-gcm', key, iv);
        decrypt.setAuthTag(tag);
        const plain = Buffer.concat([decrypt.update(encrypted), decrypt.final()]);
        assert.equal(sha256(plain), manifest.database.checksum);
        restored = new PGlite({ loadDataDir: new Blob([new Uint8Array(plain)]) });
        assert.equal((await restored.query<{
            n: number;
        }>('select count(*)::int n from public.menu_versions')).rows[0].n, 1);
        for (const item of manifest.objects) {
            const copy = objects.get(item.key)!.slice();
            assert.equal(sha256(copy), item.checksum);
            assert.equal(copy.length, item.bytes);
        }
        const corrupt = encrypted.slice();
        corrupt[3] ^= 1;
        const bad = createDecipheriv('aes-256-gcm', key, iv);
        bad.setAuthTag(tag);
        assert.throws(() => Buffer.concat([bad.update(corrupt), bad.final()]));
        t.diagnostic(`Fixture only: database dump ${bytes.length} bytes, 2 object payloads, restore/check total ${(performance.now() - start).toFixed(0)} ms. Not production RPO/RTO; pg_dump/age CLI untested here.`);
    }
    finally {
        await restored?.close();
        await db.close();
    }
});
