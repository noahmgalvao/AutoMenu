import { validateRevisionDocument } from '../../domain/revisions/document';
import { collectAssets } from './repository';
import { externalizeEmbeddedAssets } from './embeddedAssets';
import { classifyChange } from '../../domain/revisions/events';
import type { Json, RevisionMetadata, StoredState } from '../../domain/revisions/model';
import { canonicalize, persistentDocument } from '../../domain/revisions/canonical';
import { RevisionRepository, resultOf } from './repository';
import { sha256 } from './codec';
export class RevisionService {
    constructor(readonly repo: RevisionRepository) { }
    async migrateBatch(menuId: string, actor: string) {
        const namespace = await this.repo.authorize(menuId, actor), runtime = await this.repo.runtime(menuId);
        if (runtime?.migrated)
            return true;
        const { menu } = await this.repo.current(menuId);
        const rows = await resultOf(this.repo.db.from('menu_versions').select('id,menu_id,version_number,created_at,created_by,version_type,render_snapshot,action_label').eq('menu_id', menuId).gt('version_number', runtime?.legacy_cursor || 0).order('version_number').limit(30));
        for (const row of rows) {
            // Existing verified snapshots only. Embedded legacy assets require the asset migration tool first.
            if (!Array.isArray(row.render_snapshot?.products) || !row.render_snapshot?.style)
                throw new Error('Estado legado sem documento completo; migração requer recuperação verificada.');
            const document = await externalizeEmbeddedAssets(this.repo.db, namespace, actor, row.render_snapshot);
            const r = await this.repo.runtime(menuId);
            const baseId = r?.last_revision_id ? (await this.repo.metadata(menuId,r.last_revision_id)).state_id : undefined;
            const prepared = await this.repo.prepare(namespace, document, `legacy:${row.id}`, baseId, !r || r.next_sequence === 1);
            await this.repo.rpc('revision_commit', { p_menu: menuId, p_actor: actor, p_expected: menu.revision_write_version, p_operation: `legacy:${row.id}`, p_state: prepared.state, p_blob: prepared.blob, p_assets: prepared.assets, p_options: { legacyVersionId: row.id, original: !r || r.next_sequence === 1, kind: row.version_type === 'published' ? 'published' : 'legacy', name: !r || r.next_sequence === 1 ? (row.action_label === 'Cardápio criado' && row.version_number === 1 ? 'Original' : 'Primeira versão disponível') : null, priority: row.version_type === 'published' ? 2 : 0, createdAt: row.created_at, actorId: row.created_by, forceLogical: true, advance: true } });
            await this.repo.rpc('revision_advance_legacy', { p_menu: menuId, p_version: row.version_number });
        }
        if (rows.length === 30) {
            await resultOf(this.repo.db.from('revision_jobs').upsert({ menu_id: menuId, due_at: new Date(Date.now() + 30000).toISOString() }, { onConflict: 'menu_id' }));
            return false;
        }
        // Do not make the active row mutable if an old client raced the migration.
        const latest = await this.repo.menu(menuId);
        if (latest.current_draft_version_id !== menu.current_draft_version_id)
            throw new Error('O cardápio mudou durante a migração; tente novamente.');
        await this.repo.rpc('revision_finish_migration', { p_menu: menuId, p_actor: actor, p_current: menu.current_draft_version_id });
        await this.repo.compact(menuId, actor);
        return true;
    }
    async ready(menuId: string, actor: string) {
        if (!await this.migrateBatch(menuId, actor))
            throw new Error('Migração do histórico em andamento. Tente novamente para continuar o próximo lote.');
    }
    async save(menuId: string, actor: string, input: {
        expectedWrite: number;
        operationId: string;
        snapshot: Json;
        editor: Json;
        actionLabel?: string;
        catalog?: Json;
    }) {
        validateRevisionDocument(input.snapshot);
        input = {...input,snapshot:await externalizeEmbeddedAssets(this.repo.db,await this.repo.authorize(menuId,actor),actor,input.snapshot)};
        await this.ready(menuId, actor);
        const { menu, document } = await this.repo.current(menuId);
        if (Number(menu.revision_write_version) !== input.expectedWrite && menu.revision_last_operation !== input.operationId)
            throw Object.assign(new Error('Conflito: alterações em outro dispositivo. Estado local preservado.'), {code:'40001'});
        await this.repo.rpc('revision_assert_assets', { p_namespace: await this.repo.authorize(menuId, actor), p_assets: collectAssets(input.snapshot) });
        const priority = classifyChange(document, input.snapshot, input.actionLabel);
        if (priority >= 2)
            await this.repo.checkpoint(menuId, actor, `${input.operationId}:pre`, { priority, kind: 'before', tags: [input.actionLabel || 'Alteração estrutural'] });
        const hash = sha256(canonicalize(persistentDocument(input.snapshot)));
        const result = await this.repo.rpc('revision_save_draft', { p_menu: menuId, p_actor: actor, p_expected: input.expectedWrite, p_operation: input.operationId, p_editor: editorOf(input.snapshot), p_snapshot: input.snapshot, p_hash: hash, p_catalog: input.catalog || null });
        // Current state is durable even when an ordinary/post checkpoint fails. Destructive edits require the pre checkpoint above.
        const history = await this.repo.config().catch(() => null);
        let historyWarning: string | null = !history || !history.enabled || history.capacity_level >= 95 || history.checkpoint_pause_reason ? 'Histórico temporariamente indisponível por capacidade ou configuração.' : null;
        if (priority >= 2) {
            try {
                await this.repo.checkpoint(menuId, actor, `${input.operationId}:post`, { priority, kind: 'after', tags: [input.actionLabel || 'Alteração estrutural'] });
            }
            catch (error) {
                historyWarning = String((error as any)?.message || 'Histórico temporariamente indisponível');
            }
        }
        return { ...result, historyWarning };
    }
    async restore(menuId: string, actor: string, revisionId: string, expectedWrite: number, operationId: string) {
        await this.ready(menuId, actor);
        const namespace = await this.repo.authorize(menuId, actor), source = await this.repo.metadata(menuId, revisionId), { menu, document } = await this.repo.current(menuId);
        if (menu.revision_write_version !== expectedWrite)
            throw new Error('Conflito: recarregue a versão atual antes de restaurar.');
        const historical = await this.repo.read(source.state_id, namespace);
        const pre = await this.repo.prepare(namespace, await externalizeEmbeddedAssets(this.repo.db,namespace,actor,document), `${operationId}:pre`, undefined, true), post = await this.repo.prepare(namespace, historical, `${operationId}:post`, undefined, true);
        const result = await this.repo.rpc('revision_restore', { p_menu: menuId, p_actor: actor, p_expected: expectedWrite, p_operation: operationId, p_source: revisionId, p_pre: pre, p_post: post, p_editor: editorOf(historical), p_snapshot: historical, p_assets: post.assets });
        if (!result.noop) {
            try {
                const compacted = await this.repo.compact(menuId, actor, [result.pre, result.post, result.source]);
                if (compacted)
                    await resultOf(this.repo.db.from('revision_leases').delete().eq('id', operationId));
                else
                    await resultOf(this.repo.db.from('revision_jobs').upsert({ menu_id: menuId, due_at: new Date(Date.now() + 600000).toISOString() }, { onConflict: 'menu_id' }));
            }
            catch {
                await resultOf(this.repo.db.from('revision_jobs').upsert({ menu_id: menuId, due_at: new Date(Date.now() + 600000).toISOString() }, { onConflict: 'menu_id' })).catch(() => { });
            }
        }
        return result;
    }
    async copy(menuId: string, actor: string, revisionId: string, operationId: string) {
        const namespace = await this.repo.authorize(menuId, actor), revision = await this.repo.metadata(menuId, revisionId), document = await this.repo.read(revision.state_id, namespace);
        const prepared = await this.repo.prepare(namespace, document, operationId, undefined, true);
        return this.repo.rpc('revision_copy', { p_menu: menuId, p_actor: actor, p_revision: revisionId, p_operation: operationId, p_editor: editorOf(document), p_snapshot: document, p_prepared: prepared, p_assets: prepared.assets });
    }
    async protect(menuId: string, actor: string, input: {
        revisionId: string;
        name?: string;
        protect: boolean;
        confirmed?: boolean;
        operationId: string;
    }): Promise<RevisionMetadata> {
        const revision = await this.repo.metadata(menuId, input.revisionId);
        if (input.protect) {
            const state = await resultOf(this.repo.db.from('revision_states').select('*').eq('id', revision.state_id).single()) as StoredState;
            await this.repo.materialize(state, input.operationId);
        }
        const result = await this.repo.rpc('revision_protect', { p_menu: menuId, p_actor: actor, p_revision: input.revisionId, p_name: input.name || null, p_protect: input.protect, p_confirmed: !!input.confirmed, p_operation: input.operationId });
        if (!input.protect)
            await this.repo.compact(menuId, actor);
        return result;
    }
    async runJobs(limit = 10) {
        await this.repo.rpc('revision_housekeeping');
        const config = await this.repo.config(), metrics = structuredClone(config.metrics);
        const measured = await this.repo.rpc('revision_measure_capacity').catch(() => null);
        metrics.database = { ...(metrics.database || { limit: null }), used: measured?.databaseBytes ?? null, observedAt: measured?.observedAt || null, source: measured ? 'pg_database_size' : 'unavailable' };
        if (this.repo.stores.active === 'supabase-v1')
            metrics.storage = { ...(metrics.storage || { limit: null }), used: measured && Number(measured.storageMissingSizes) === 0 ? measured.storageBytes : null, observedAt: measured && Number(measured.storageMissingSizes) === 0 ? measured.observedAt : null, source: measured && Number(measured.storageMissingSizes) === 0 ? 'Storage object metadata; not billing' : 'unavailable' };
        await this.repo.rpc('revision_record_metrics', { p_metrics: metrics, p_healthy: !!measured });
        const token = crypto.randomUUID(), jobs = await this.repo.rpc('revision_claim_jobs', { p_token: token, p_limit: limit });
        let completed = 0;
        for (const job of jobs) {
            try {
                const current = await this.repo.current(job.menu_id);
                const owner = await resultOf(this.repo.db.from('workspaces').select('owner_user_id').eq('id', current.menu.workspace_id).single());
                const actor = current.version.created_by || owner.owner_user_id;
                if (!actor)
                    throw new Error('Identidade autorizada indisponível; migração pendente.');
                if (!await this.migrateBatch(job.menu_id, actor)) {
                    await resultOf(this.repo.db.from('revision_jobs').update({ lease_token: null, lease_until: null, attempts: 0 }).eq('menu_id', job.menu_id));
                    continue;
                }
                const events = await resultOf(this.repo.db.from('revision_publication_events').select('version_id').eq('menu_id', job.menu_id).order('created_at').limit(10));
                for (const event of events) {
                    const version = await resultOf(this.repo.db.from('menu_versions').select('render_snapshot').eq('id', event.version_id).eq('menu_id', job.menu_id).single());
                    await this.repo.checkpoint(job.menu_id, actor, `publication:${event.version_id}`, { priority: 2, kind: 'published', tags: ['Publicação'], advance: false }, version.render_snapshot);
                    await resultOf(this.repo.db.from('revision_publication_events').delete().eq('version_id', event.version_id));
                }
                const runtime = await this.repo.runtime(job.menu_id);
                await this.repo.checkpoint(job.menu_id, actor, `checkpoint:${job.menu_id}:${runtime.pending_generation}`);
                completed++;
            }
            catch (error) {
                await resultOf(this.repo.db.from('revision_jobs').update({ lease_until: null, lease_token: null, last_error: String((error as any)?.code || 'checkpoint_failed'), due_at: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(Number(job.attempts) || 0, 7))).toISOString() }).eq('menu_id', job.menu_id).eq('lease_token', token));
                await resultOf(this.repo.db.from('revision_menu_state').update({ paused_reason: 'Histórico temporariamente indisponível; estado atual preservado no servidor.' }).eq('menu_id', job.menu_id));
            }
        }
        return { claimed: jobs.length, completed };
    }
    async optimizeBases(limit = 3) {
        const config = await this.repo.config();
        if (config.capacity_level >= 85 || config.checkpoint_pause_reason)
            return { rebased: 0 };
        const candidates = await this.repo.rpc('revision_rebase_candidates', { p_limit: Math.min(3, limit) });
        let rebased = 0;
        for (const candidate of candidates) {
            const state = candidate.state as StoredState;
            const document = await this.repo.read(state.id, state.namespace);
            const snapshot = await this.repo.codec.encode(document, undefined, true);
            if (snapshot.bytes.length * 1.1 >= Number(candidate.reclaimableBytes))
                continue;
            await this.repo.materialize(state, `rebase:${state.id}:${(state as any).generation}`, document);
            rebased++;
        }
        return { rebased };
    }
    async gc(limit = 10) {
        const rows = await this.repo.rpc('revision_gc', { p_limit: limit });
        let removed = 0;
        for (const row of rows) {
            await this.repo.stores.get(row.provider_id).remove(row, row.generation);
            await resultOf(this.repo.db.from('revision_blobs').delete().eq('id', row.id).eq('generation', row.generation).eq('status', 'deleting'));
            removed++;
        }
        const assets = await this.repo.rpc('revision_gc_assets', { p_limit: limit });
        let removedAssets = 0;
        for (const asset of assets) {
            const { error } = await this.repo.db.storage.from(asset.bucket).remove([asset.path]);
            if (error)
                throw error;
            await resultOf(this.repo.db.from('assets').delete().eq('id', asset.id).eq('metadata->>history_gc_status', 'deleting').eq('metadata->>history_gc_generation', String(asset.metadata.history_gc_generation)));
            removedAssets++;
        }
        return { removed, removedAssets };
    }
}
export function editorOf(document: Json) { const d = document as any; return { style: d.style, freeTextProducts: d.products.filter((p: any) => p.isFreeText), sortOption: d.sortOption || { field: 'category', direction: 'asc' } }; }
