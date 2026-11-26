import process from 'node:process';
import { externalizeEmbeddedAssets } from './embeddedAssets';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, RevisionMetadata, StoredState, BlobLocator, RevisionFilter, RevisionPage } from '../../domain/revisions/model';
import { retain } from '../../domain/revisions/retention';
import { canonicalize } from '../../domain/revisions/canonical';
import { RevisionCodec, sha256 } from './codec';
import { BlobStores } from './blobStore';
export const metadataColumns = 'id,menu_id,sequence,created_at,actor_id,kind,priority,event_tags,name,protection,state_hash,state_id,schema_version,source_revision_id';
export const resultOf = async (query: PromiseLike<any>) => {
    const { data, error } = await query;
    if (error)
        throw error;
    return data;
};
export class RevisionRepository {
    constructor(readonly db: SupabaseClient, readonly stores: BlobStores, readonly codec = new RevisionCodec()) { }
    rpc(name: string, args: Record<string, unknown> = {}) { return resultOf(this.db.rpc(name, args)); }
    async authorize(menuId: string, actor: string) { return this.rpc('revision_assert_actor', { p_menu: menuId, p_actor: actor }) as Promise<string>; }
    async menu(menuId: string) { return resultOf(this.db.from('menus').select('*').eq('id', menuId).single()); }
    async config() { return resultOf(this.db.from('revision_config').select('*').eq('id', true).single()); }
    async runtime(menuId: string) { return resultOf(this.db.from('revision_menu_state').select('*').eq('menu_id', menuId).maybeSingle()); }
    async metadata(menuId: string, id: string): Promise<RevisionMetadata> { return resultOf(this.db.from('menu_revisions').select(metadataColumns).eq('menu_id', menuId).eq('id', id).single()); }
    async current(menuId: string) { const menu = await this.menu(menuId); const version = await resultOf(this.db.from('menu_versions').select('*').eq('id', menu.current_draft_version_id).single()); return { menu, version, document: version.render_snapshot as Json }; }
    async read(stateId: string, namespace: string): Promise<Json> {
        const lease = crypto.randomUUID();
        const rows = await this.rpc('revision_read_chain', { p_state: stateId, p_namespace: namespace, p_lease: lease }) as {
            state: StoredState;
            blob: BlobLocator;
            locations?: Partial<BlobLocator>[];
        }[];
        if (!rows?.length || rows.length > 50 || rows.reduce((n, r) => n + r.blob.byte_length, 0) > 16 * 1024 * 1024)
            throw new Error('Cadeia excede orçamento de leitura.');
        const entries = new Map(rows.map(r => [r.state.id, r]));
        const load = (id: string, seen = new Set<string>()): Promise<Json> => {
            if (seen.has(id))
                throw new Error('Ciclo de deltas.');
            const row = entries.get(id);
            if (!row)
                throw new Error('Base indisponível.');
            const bytes = async () => {
                const candidates = [row.blob, ...(row.locations || []).map(location => ({ ...row.blob, ...location }))];
                let failure: unknown;
                for (const locator of candidates) {
                    try {
                        return await this.stores.get(locator.provider_id).get(locator);
                    }
                    catch (error) {
                        failure = error;
                    }
                }
                throw failure || new Error('Todas as localizações estão indisponíveis.');
            };
            return bytes().then(payload => this.codec.decode(row.state, payload, load, seen));
        };
        try {
            return await load(stateId);
        }
        finally {
            await resultOf(this.db.from('revision_leases').delete().eq('id', lease));
        }
    }
    async prepare(namespace: string, document: Json, operationId: string, baseId?: string, forceSnapshot = false) {
        const initial = await this.codec.encode(document);
        const existing = await resultOf(this.db.from('revision_states').select('*').eq('namespace', namespace).eq('state_hash', initial.stateHash).eq('schema_version', 1).maybeSingle()) as StoredState | null;
        if (existing) {
            if (forceSnapshot && existing.representation === 'delta')
                await this.materialize(existing, operationId);
            return { state: { ...existing, representation: forceSnapshot ? 'snapshot' : existing.representation }, blob: {}, assets: collectAssets(initial.document) };
        }
        let base: {
            state: StoredState;
            document: Json;
        } | undefined;
        if (baseId && !forceSnapshot) {
            const state = await resultOf(this.db.from('revision_states').select('*').eq('id', baseId).eq('namespace', namespace).single());
            const start = performance.now();
            base = { state, document: await this.read(baseId, namespace) };
            if (performance.now() - start > (this.codec.limits.maxReconstructMs || 100))
                forceSnapshot = true;
        }
        const encoded = base ? await this.codec.encode(document, base, forceSnapshot) : initial;
        const blob = await this.upload(namespace, operationId, encoded.bytes, encoded.payloadHash);
        const state: StoredState = { id: sha256(`${namespace}:${encoded.stateHash}:1`), namespace, state_hash: encoded.stateHash, schema_version: 1, representation: encoded.representation, base_state_id: encoded.baseStateId, chain_depth: encoded.depth, codec: encoded.codec, patch_version: 1, byte_length: encoded.bytes.length, raw_length: encoded.rawLength, payload_hash: encoded.payloadHash, blob_id: blob.id, chain_bytes: encoded.chainBytes };
        return { state, blob, assets: collectAssets(encoded.document) };
    }
    async upload(namespace: string, operationId: string, bytes: Uint8Array, checksum: string): Promise<BlobLocator> {
        const id = sha256(`${namespace}:${checksum}`), store = this.stores.writer();
        await this.rpc('revision_reserve', { p_operation: operationId, p_namespace: namespace, p_bytes: bytes.length });
        let row = await resultOf(this.db.from('revision_blobs').select('*').eq('id', id).maybeSingle());
        if (row?.status === 'deleting')
            throw new Error('Objeto em coleta; tente novamente.');
        const locator: BlobLocator = { ...store.planImmutable(namespace, checksum, bytes.length, checksum), id };
        await resultOf(this.db.from('revision_blobs').upsert({ ...locator, status: 'pending', lease_until: new Date(Date.now() + 600000).toISOString() }, { onConflict: 'id', ignoreDuplicates: true }));
        row = await resultOf(this.db.from('revision_blobs').select('*').eq('id', id).single());
        if (row.status === 'deleting')
            throw new Error('Objeto em coleta.');
        const refreshed = await resultOf(this.db.from('revision_blobs').update({ lease_until: new Date(Date.now() + 600000).toISOString() }).eq('id', id).eq('generation', row.generation).neq('status', 'deleting').select('*').single());
        if (row.status !== 'ready') {
            const target = this.stores.get(refreshed.provider_id), plan = target.planImmutable(namespace, checksum, bytes.length, checksum);
            if (plan.bucket !== refreshed.bucket || plan.object_key !== refreshed.object_key)
                throw new Error('Configuração do provedor diverge do upload reservado.');
            const actual = await target.putImmutable(namespace, checksum, bytes, checksum);
            if (actual.bucket !== refreshed.bucket || actual.object_key !== refreshed.object_key || actual.checksum !== checksum || actual.byte_length !== bytes.length)
                throw new Error('Provedor retornou localização divergente.');
        }
        else
            await this.stores.get(refreshed.provider_id).head(refreshed);
        return refreshed;
    }
    async materialize(state: StoredState, operationId: string, preparedDocument?: Json) {
        if (state.representation === 'snapshot')
            return;
        const document = preparedDocument || await this.read(state.id, state.namespace), encoded = await this.codec.encode(document, undefined, true);
        const blob = await this.upload(state.namespace, operationId, encoded.bytes, encoded.payloadHash);
        const ok = await this.rpc('revision_rebase', { p_state: state.id, p_generation: (state as any).generation || 1, p_blob: blob.id, p_metadata: { state_hash: state.state_hash, codec: encoded.codec, raw_length: encoded.rawLength } });
        if (!ok)
            throw new Error('Conflito durante materialização; tente novamente.');
    }
    async checkpoint(menuId: string, actor: string, operationId: string, options: Record<string, unknown> = {}, documentOverride?: Json) {
        const started = performance.now();
        let cpuBefore: ReturnType<typeof process.cpuUsage> | undefined;
        try { if (!('Deno' in globalThis)) cpuBefore = process.cpuUsage(); } catch { /* Some Edge runtimes do not expose CPU counters. */ }
        const previousOperation = await resultOf(this.db.from('revision_operations').select('result').eq('menu_id', menuId).eq('operation_id', operationId).maybeSingle());
        if (previousOperation)
            return this.metadata(menuId, previousOperation.result.revisionId);
        const namespace = await this.authorize(menuId, actor), { menu, document } = await this.current(menuId), runtime = await this.runtime(menuId);
        if (options.expectedWrite !== undefined && Number(options.expectedWrite) !== Number(menu.revision_write_version))
            throw Object.assign(new Error('Conflito: cardápio alterado em outro dispositivo'), { code: '40001' });
        let baseId: string | undefined;
        if (runtime?.last_revision_id)
            baseId = (await this.metadata(menuId, runtime.last_revision_id)).state_id;
        const prepared = await this.prepare(namespace, await externalizeEmbeddedAssets(this.db,namespace,actor,documentOverride || document), operationId, baseId, !!options.manual || !!options.original);
        const revision = await this.rpc('revision_commit', { p_menu: menuId, p_actor: actor, p_expected: menu.revision_write_version, p_operation: operationId, p_state: prepared.state, p_blob: prepared.blob, p_options: options, p_assets: prepared.assets }) as RevisionMetadata;
        let cpuMicros: number | null = null, memory: number | null = null;
        try { if (cpuBefore) { const cpu = process.cpuUsage(cpuBefore); cpuMicros = cpu.user + cpu.system; } } catch { /* Unavailable is not zero. */ }
        try { memory = process.memoryUsage().rss; } catch { /* Provider memory metrics are independent. */ }
        await this.rpc('revision_observe', { p_namespace: namespace, p_ms: performance.now() - started, p_cpu: cpuMicros, p_bytes: prepared.state.byte_length, p_memory: memory }).catch(() => { });
        try {
            const compacted = await this.compact(menuId, actor, options.kind === 'published' ? [revision.id] : []);
            if (compacted && options.kind === 'published')
                await resultOf(this.db.from('revision_leases').delete().eq('id', `pub:${operationId}`));
        }
        catch {
            await resultOf(this.db.from('revision_jobs').upsert({ menu_id: menuId, due_at: new Date(Date.now() + 30000).toISOString() }, { onConflict: 'menu_id' })).catch(() => { });
        }
        return revision;
    }
    async compact(menuId: string, actor: string, pins: string[] = []) {
        const [runtime, config] = await Promise.all([this.runtime(menuId), this.config()]);
        if (!runtime)
            return true;
        const count = await this.db.from('menu_revisions').select('id', { head: true, count: 'exact' }).eq('menu_id', menuId).is('protection', null);
        if (count.error)
            throw count.error;
        if ((count.count || 0) <= runtime.retention_limit)
            return true;
        // Metadata only; 1,101 nominal entries. Legacy backfills are cursor-batched separately.
        const rows: RevisionMetadata[] = [];
        let cursor = 0;
        while (true) {
            const page = await resultOf(this.db.from('menu_revisions').select(metadataColumns).eq('menu_id', menuId).gt('sequence', cursor).order('sequence').limit(500));
            rows.push(...page);
            if (page.length < 500)
                break;
            cursor = page[page.length - 1].sequence;
        }
        const leases = await resultOf(this.db.from('revision_leases').select('revision_ids').eq('menu_id', menuId).gt('expires_at', new Date().toISOString()));
        const pinned = new Set<string>([...pins, ...leases.flatMap((l: any) => l.revision_ids), runtime.last_revision_id].filter(Boolean));
        const keep = retain(rows.map(r => ({ ...r, sequence: Number(r.sequence), createdAt: r.created_at })), { maxAutomatic: runtime.retention_limit, recentReserve: config.recent_reserve, milestoneReserve: config.milestone_reserve, timeZone: runtime.timezone }, pinned);
        if (keep.filter(r => !r.protection).length > runtime.retention_limit)
            return false;
        await this.rpc('revision_compact', { p_menu: menuId, p_actor: actor, p_expected_sequence: runtime.next_sequence, p_keep: keep.map(r => r.id), p_pins: [...pinned] });
        return true;
    }
    async page(menuId: string, filter: RevisionFilter, cursor?: number, since?: string, until?: string): Promise<RevisionPage> {
        let query = this.db.from('menu_revisions').select(metadataColumns).eq('menu_id', menuId).order('sequence', { ascending: false }).limit(31);
        if (cursor)
            query = query.lt('sequence', cursor);
        if (filter === 'protected')
            query = query.not('protection', 'is', null);
        if (filter === 'important')
            query = query.gte('priority', 2);
        if (since)
            query = query.gte('created_at', since);
        if (until)
            query = query.lte('created_at', until);
        const [items, runtime, config, automatic, protectedCount, original] = await Promise.all([resultOf(query), this.runtime(menuId), this.config(),
            this.db.from('menu_revisions').select('id', { head: true, count: 'exact' }).eq('menu_id', menuId).is('protection', null),
            this.db.from('menu_revisions').select('id', { head: true, count: 'exact' }).eq('menu_id', menuId).eq('protection', 'user'),
            this.db.from('menu_revisions').select('id', { head: true, count: 'exact' }).eq('menu_id', menuId).eq('protection', 'original')]);
        for (const result of [automatic, protectedCount, original])
            if (result.error)
                throw result.error;
        const resources = ['database', 'disk', 'storage', 'egressCached', 'egressUncached', 'cpu', 'memory'];
        return { items: items.slice(0, 30), nextCursor: items.length > 30 ? items[29].sequence : null, status: { migrating: !runtime?.migrated, automatic: automatic.count || 0, protected: protectedCount.count || 0, original: original.count || 0, nextManual: Number(runtime?.manual_counter || 0) + 1, maxAutomatic: runtime?.retention_limit || config.max_automatic, maxProtected: config.max_protected, compacted: Number(runtime?.compacted || 0), pausedReason: !runtime?.migrated ? 'Histórico legado em preparação no servidor. Atualize a lista após a conclusão.' : !config.enabled ? 'Novas revisões temporariamente desativadas pelo administrador' : config.checkpoint_pause_reason || runtime?.paused_reason || (config.capacity_level >= 95 ? 'Histórico pausado por capacidade' : null), unavailableMetrics: resources.filter(k => config.metrics[k]?.used == null || config.metrics[k]?.limit == null || !config.metrics[k]?.observedAt || Date.parse(config.metrics[k].observedAt) < Date.now() - 900000) } };
    }
}
export function collectAssets(document: Json): string[] {
    const ids = new Set<string>();
    const visit = (v: Json) => {
        if (typeof v === 'string' && v.startsWith('asset://'))
            ids.add(v.slice(8));
        else if (Array.isArray(v))
            v.forEach(visit);
        else if (v && typeof v === 'object')
            for (const [k, x] of Object.entries(v)) {
                if (/assetId$/i.test(k) && typeof x === 'string' && x)
                    ids.add(x);
                else
                    visit(x);
            }
    };
    visit(document);
    return [...ids].sort();
}
export const documentHash = (document: Json) => sha256(canonicalize(document));
