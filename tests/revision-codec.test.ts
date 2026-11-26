import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { RevisionCodec, sha256, applyPatch } from '../src/infrastructure/revisions/codec';
import { canonicalize, persistentDocument } from '../src/domain/revisions/canonical';
import type { Json, StoredState } from '../src/domain/revisions/model';
export function stored(encoded: Awaited<ReturnType<RevisionCodec['encode']>>, id = 's'): StoredState { return { id, namespace: 'w', state_hash: encoded.stateHash, schema_version: 1, representation: encoded.representation, base_state_id: encoded.baseStateId, chain_depth: encoded.depth, codec: encoded.codec, patch_version: 1, byte_length: encoded.bytes.length, raw_length: encoded.rawLength, payload_hash: encoded.payloadHash, blob_id: id, chain_bytes: encoded.chainBytes }; }
test('canonical state preserves IDs, arrays, Unicode and meaning, strips only persistent asset URLs and root savedAt', () => {
    assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
    const state = persistentDocument({ savedAt: 'volatile', products: [{ id: '🍔', imageAssetId: 'id', image: 'signed?token=x', name: 'Açaí' }], style: { text: 'savedAt' } });
    assert.equal(canonicalize(state), '{"products":[{"id":"🍔","imageAssetId":"id","name":"Açaí"}],"style":{"text":"savedAt"}}');
    assert.throws(() => persistentDocument({ image: 'data:image/png;base64,abc' }));
    assert.throws(() => canonicalize(JSON.parse('{"__proto__":{}}')));
    assert.throws(() => canonicalize(Infinity));
});
test('snapshots/deltas lossless across array reorders, removals, Unicode and type changes', async () => {
    const codec = new RevisionCodec(), states = new Map<string, {
        state: StoredState;
        bytes: Uint8Array;
        document: Json;
    }>();
    let base: {
        state: StoredState;
        document: Json;
    } | undefined;
    let deltas = 0;
    const load = async (id: string, seen = new Set<string>()): Promise<Json> => { const r = states.get(id)!; return codec.decode(r.state, r.bytes, load, seen); };
    for (let i = 0; i < 110; i++) {
        const document = { products: Array.from({ length: 90 }, (_, n) => ({ id: `p${n}`, name: `Produto ${n} áéê`, price: n === 15 ? i : n, description: 'Descrição realista da refeição com ingredientes.' })), style: { title: 'Cardápio', columns: 3 }, extra: i % 2 ? null : { a: true } };
        const encoded = await codec.encode(document, base), state = stored(encoded, `s${i}`);
        assert.ok(state.chain_depth <= 49);
        if (state.representation === 'delta')
            deltas++;
        states.set(state.id, { state, bytes: encoded.bytes, document });
        assert.deepEqual(await load(state.id), document);
        base = { state, document };
    }
    assert.ok(deltas > 90);
    const variants: Json[] = [[1, 2, 3], [3, 1, 2], { a: 1, b: 2 }, { a: null }, [], null, 'Texto'];
    for (const document of variants) {
        const e = await codec.encode(document, base), s = stored(e, 'variant');
        assert.deepEqual(await codec.decode(s, e.bytes, load), document);
    }
});
test('small or unhelpful deltas choose raw/snapshot, schemas force anchors', async () => { const codec = new RevisionCodec(), tiny = await codec.encode(null); assert.equal(tiny.codec, 'raw-v1'); const initial = await codec.encode({ a: 'x'.repeat(1000) }), state = stored(initial); const different = await codec.encode({ z: randomBytes(900).toString('hex') }, { state, document: { a: 'x'.repeat(1000) } }); assert.equal(different.representation, 'snapshot'); state.schema_version = 2; assert.equal((await codec.encode({ a: 'x'.repeat(999) + 'y' }, { state, document: { a: 'x'.repeat(1000) } })).representation, 'snapshot'); });
test('hostile patches, cycles, excessive depth, expansion and checksum mismatch rejected', async () => {
    const codec = new RevisionCodec({ maxBytes: 1024, maxPatchOperations: 10, deltaMaxRatio: .7, maxChainBytes: 1024 }), e = await codec.encode({ a: 1 }), s = stored(e);
    await assert.rejects(codec.decode({ ...s, payload_hash: 'a'.repeat(64) }, e.bytes, async () => null));
    await assert.rejects(codec.decode({ ...s, chain_depth: 50 }, e.bytes, async () => null));
    await assert.rejects(codec.decode(s, e.bytes, async () => null, new Set(['s'])));
    assert.throws(() => applyPatch({}, [{ op: 'set', path: ['__proto__', 'p'], value: true }]));
    assert.throws(() => applyPatch({}, [{ op: 'remove', path: ['missing'] }]));
    assert.throws(() => applyPatch({}, Array.from({ length: 11 }, () => ({ op: 'set' as const, path: ['a'], value: 1 })), 10));
    const bomb = gzipSync(' '.repeat(1024 * 1024));
    await assert.rejects(codec.decode({ ...s, codec: 'gzip-v1', byte_length: bomb.length, payload_hash: sha256(bomb) }, bomb, async () => null));
});
