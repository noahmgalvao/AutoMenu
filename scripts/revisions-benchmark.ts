import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { RevisionCodec } from '../src/infrastructure/revisions/codec';
import type { Json, StoredState } from '../src/domain/revisions/model';
import { INITIAL_STYLE } from '../src/domain/menu/defaults';
const percentile = (values: number[], p: number) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const measure = (values: number[]) => ({ p50: percentile(values, .5), p95: percentile(values, .95), max: Math.max(...values) });
const results = [];
const codec = new RevisionCodec();
for (const [size, count] of [['small', 15], ['medium', 180], ['large', 900]] as const) {
    const products = Array.from({ length: count }, (_, i) => ({ id: `product-${i.toString().padStart(6, '0')}`, category: `Categoria ${Math.floor(i / 12)}`, categoryId: `category-${Math.floor(i / 12)}`, name: `${['Sanduíche', 'Prato', 'Sobremesa', 'Bebida'][i % 4]} ${i} da casa`, description: `Preparação ${i} com ${['tomate e manjericão', 'cebola caramelizada', 'creme de queijo', 'calda artesanal'][i % 4]}, ingredientes selecionados e acompanhamento ${i % 23}.`, price: 12 + (i * 73 % 1200) / 100, imageAssetId: `asset-${i % 7}` }));
    let base: {
        state: StoredState;
        document: Json;
    } | undefined;
    let forceLatencyAnchor = false;
    let snapshots = 0, hybrid = 0, anchors = 0, delta = 0, maxDepth = 0, rawBytes = 0;
    const snapshotTimes = [], hybridTimes = [], cpuMicros = [], snapshotLengths = [], hybridLengths = [], readTimes = [];
    const states = new Map<string, {
        state: StoredState;
        bytes: Uint8Array;
    }>();
    let peakInflight = 0;
    const read = async (id: string, seen = new Set<string>()): Promise<Json> => { const r = states.get(id)!; return codec.decode(r.state, r.bytes, read, seen); };
    for (let i = 0; i < 65; i++) {
        const document = { products: products.map((p, n) => n === i % count ? { ...p, price: p.price + i / 100, description: p.description + ` Lote ${i}.` } : p), style: { ...INITIAL_STYLE, menuTitle: `Casa do Sabor — ${size}` }, sortOption: { field: 'category', direction: 'asc' } } as unknown as Json;
        const t = performance.now(), snapshot = await codec.encode(document, undefined, true);
        snapshotTimes.push(performance.now() - t);
        snapshots += snapshot.bytes.length;
        snapshotLengths.push(snapshot.bytes.length);
        rawBytes += snapshot.rawLength;
        const start = performance.now(), cpu = process.cpuUsage(), encoded = await codec.encode(document, base, forceLatencyAnchor);
        hybridTimes.push(performance.now() - start);
        const usage = process.cpuUsage(cpu);
        cpuMicros.push(usage.user + usage.system);
        hybrid += encoded.bytes.length;
        hybridLengths.push(encoded.bytes.length);
        encoded.representation === 'snapshot' ? anchors++ : delta++;
        const state: StoredState = { id: `state-${i}`, namespace: 'fixture', state_hash: encoded.stateHash, schema_version: 1, representation: encoded.representation, base_state_id: encoded.baseStateId, chain_depth: encoded.depth, codec: encoded.codec, patch_version: 1, byte_length: encoded.bytes.length, raw_length: encoded.rawLength, payload_hash: encoded.payloadHash, blob_id: `blob-${i}`, chain_bytes: encoded.chainBytes };
        states.set(state.id, { state, bytes: encoded.bytes });
        maxDepth = Math.max(maxDepth, state.chain_depth);
        peakInflight = Math.max(peakInflight, snapshot.rawLength + encoded.rawLength + snapshot.bytes.length + encoded.bytes.length);
        const rt = performance.now();
        await read(state.id);
        const reconstructionMs = performance.now() - rt;
        readTimes.push(reconstructionMs);
        forceLatencyAnchor = reconstructionMs > (codec.limits.maxReconstructMs || 100);
        base = { state, document };
    }
    const start = performance.now(), materialized = await codec.encode(base!.document, undefined, true), rebaseMs = performance.now() - start;
    results.push({ fixture: size, products: count, states: 65, rawPayloadBytes: rawBytes, compressedSnapshotBytes: snapshots, hybridBytes: hybrid, savingsVsCompressedSnapshots: 1 - hybrid / snapshots, anchors, deltas: delta, maxDepth, snapshotBytes: measure(snapshotLengths), hybridStateBytes: measure(hybridLengths), snapshotEncodeMs: measure(snapshotTimes), hybridEncodeMs: measure(hybridTimes), reconstructionMs: measure(readTimes), hybridCpuMicros: measure(cpuMicros), rebaseMs, rebaseNewBytes: materialized.bytes.length, physicalPayloadPeakDuringRebase: hybrid + materialized.bytes.length, codecBuffersPeakBytes: peakInflight, processRssBytes: process.memoryUsage().rss, processMaxRssBytes: process.resourceUsage().maxRSS * 1024 });
}
const report = { version: 1, measuredAt: new Date().toISOString(), node: process.version, source: 'Synthetic representative fixtures; no production documents or quota access.', limitations: ['Payload bytes only; excludes PostgreSQL physical tables/indexes/WAL, object metadata and assets.', 'RSS is cumulative process high-water, not isolated per document.', 'Timing includes local Node codec and reconstruct; excludes Supabase network/egress and mobile render.', 'No provider cost/cache-hit/RPO/RTO measurements.'], results };
await mkdir('docs/revisions', { recursive: true });
await writeFile('docs/revisions/benchmark-fixtures.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
