import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { canonicalize, persistentDocument } from '../../domain/revisions/canonical';
import type { Json, StoredState } from '../../domain/revisions/model';
const zip = promisify(gzip), unzip = promisify(gunzip);
export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export interface CodecLimits {
    maxBytes: number;
    maxPatchOperations: number;
    deltaMaxRatio: number;
    maxChainBytes: number;
    maxReconstructMs?: number;
    maxReconstructedBytes?: number;
}
export const CODEC_LIMITS: CodecLimits = { maxBytes: 8 * 1024 * 1024, maxPatchOperations: 20000, deltaMaxRatio: .70, maxChainBytes: 4 * 1024 * 1024, maxReconstructMs: 100, maxReconstructedBytes: 16 * 1024 * 1024 };
type Patch = {
    op: 'set' | 'remove';
    path: (string | number)[];
    value?: Json;
};
function difference(base: Json, next: Json, path: (string | number)[] = [], result: Patch[] = []): Patch[] {
    if (canonicalize(base) === canonicalize(next))
        return result;
    if (Array.isArray(base) && Array.isArray(next) && base.length === next.length) {
        next.forEach((value, i) => difference(base[i], value, [...path, i], result));
    }
    else if (base && next && typeof base === 'object' && typeof next === 'object' && !Array.isArray(base) && !Array.isArray(next)) {
        for (const key of Object.keys(base).sort())
            if (!(key in next))
                result.push({ op: 'remove', path: [...path, key] });
        for (const key of Object.keys(next).sort()) {
            if (!(key in base))
                result.push({ op: 'set', path: [...path, key], value: next[key] });
            else
                difference(base[key], next[key], [...path, key], result);
        }
    }
    else
        result.push({ op: 'set', path, value: next });
    return result;
}
export function applyPatch(base: Json, operations: Patch[], limit = CODEC_LIMITS.maxPatchOperations): Json {
    if (!Array.isArray(operations) || operations.length > limit)
        throw new Error('Patch excede limite.');
    let result = JSON.parse(canonicalize(base));
    for (const patch of operations) {
        if (!patch || !['set', 'remove'].includes(patch.op) || !Array.isArray(patch.path) || patch.path.length > 64
            || patch.path.some(p => (typeof p !== 'string' && (!Number.isInteger(p) || p < 0)) || ['__proto__', 'constructor', 'prototype'].includes(String(p))))
            throw new Error('Patch inválido.');
        if (patch.op === 'set')
            canonicalize(patch.value);
        if (!patch.path.length) {
            if (patch.op !== 'set')
                throw new Error('Remoção da raiz inválida.');
            result = patch.value;
            continue;
        }
        let node = result;
        for (const key of patch.path.slice(0, -1)) {
            if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key))
                throw new Error('Base do patch inválida.');
            node = node[key];
        }
        const last = patch.path[patch.path.length - 1];
        if (!node || typeof node !== 'object' || (Array.isArray(node) && (!Number.isInteger(last) || Number(last) >= node.length)))
            throw new Error('Caminho inválido.');
        if (patch.op === 'remove') {
            if (Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, last))
                throw new Error('Remoção inválida.');
            delete node[last];
        }
        else
            node[last] = patch.value;
    }
    canonicalize(result);
    return result;
}
export class RevisionCodec {
    constructor(readonly limits = CODEC_LIMITS) { }
    async compress(value: unknown) {
        const raw = Buffer.from(canonicalize(value));
        if (raw.length > this.limits.maxBytes)
            throw new Error('Documento excede limite de bytes.');
        const zipped = await zip(raw, { level: 6 });
        return { bytes: zipped.length < raw.length ? zipped : raw, codec: zipped.length < raw.length ? 'gzip-v1' as const : 'raw-v1' as const, rawLength: raw.length };
    }
    async encode(document: Json, base?: {
        state: StoredState;
        document: Json;
    }, forceSnapshot = false) {
        const canonical = persistentDocument(document), text = canonicalize(canonical), stateHash = sha256(text);
        const snapshot = await this.compress(canonical);
        let encoded = snapshot, representation: 'snapshot' | 'delta' = 'snapshot';
        if (base && !forceSnapshot && base.state.schema_version === 1 && base.state.chain_depth < 49 && base.state.chain_bytes < this.limits.maxChainBytes && Buffer.byteLength(text) * (base.state.chain_depth + 2) <= (this.limits.maxReconstructedBytes || 16777216)) {
            const patch = difference(base.document, canonical);
            if (patch.length <= this.limits.maxPatchOperations) {
                try {
                    const delta = await this.compress({ version: 1, baseHash: base.state.state_hash, targetHash: stateHash, operations: patch });
                    if (delta.bytes.length <= snapshot.bytes.length * this.limits.deltaMaxRatio
                        && sha256(canonicalize(applyPatch(base.document, patch))) === stateHash) {
                        encoded = delta;
                        representation = 'delta';
                    }
                }
                catch { /* A valid complete snapshot is already available; unsafe/unhelpful patches are never committed. */ }
            }
        }
        return { ...encoded, stateHash, payloadHash: sha256(encoded.bytes), representation,
            baseStateId: representation === 'delta' ? base!.state.id : null,
            depth: representation === 'delta' ? base!.state.chain_depth + 1 : 0,
            chainBytes: encoded.bytes.length + (representation === 'delta' ? base!.state.chain_bytes : 0), document: canonical };
    }
    async decode(state: StoredState, bytes: Uint8Array, loadBase: (id: string, seen: Set<string>) => Promise<Json>, seen = new Set<string>()): Promise<Json> {
        if (seen.has(state.id) || seen.size > 49 || state.chain_depth > 49 || state.schema_version !== 1 || state.patch_version !== 1)
            throw new Error('Cadeia ou esquema incompatível.');
        if (bytes.length !== state.byte_length || sha256(bytes) !== state.payload_hash || bytes.length > this.limits.maxBytes || state.raw_length > this.limits.maxBytes)
            throw new Error('Integridade do payload inválida.');
        seen = new Set(seen).add(state.id);
        const raw = state.codec === 'gzip-v1' ? await unzip(bytes, { maxOutputLength: this.limits.maxBytes }) : state.codec === 'raw-v1' ? bytes : null;
        if (!raw || raw.length !== state.raw_length)
            throw new Error('Codec ou tamanho inválido.');
        const payload = JSON.parse(Buffer.from(raw).toString('utf8'));
        canonicalize(payload);
        let document: Json = payload;
        if (state.representation === 'delta') {
            if (!state.base_state_id || payload.version !== 1 || payload.targetHash !== state.state_hash)
                throw new Error('Cabeçalho de patch inválido.');
            const base = await loadBase(state.base_state_id, seen);
            if (sha256(canonicalize(base)) !== payload.baseHash)
                throw new Error('Hash da base inválido.');
            document = applyPatch(base, payload.operations, this.limits.maxPatchOperations);
        }
        else if (state.representation !== 'snapshot' || state.base_state_id || state.chain_depth !== 0)
            throw new Error('Snapshot inválido.');
        if (Buffer.byteLength(canonicalize(document)) > this.limits.maxBytes || sha256(canonicalize(document)) !== state.state_hash)
            throw new Error('Hash do estado divergente.');
        return document;
    }
}
