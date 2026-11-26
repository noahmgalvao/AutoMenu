import process from 'node:process';
import { externalizeEmbeddedAssets } from './embeddedAssets';
import type { BlobStore } from '../../application/revisions/contracts';
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { SupabaseBlobStore, BlobStores } from './blobStore';
import { RevisionRepository } from './repository';
import { RevisionService, editorOf } from './service';
import { collectAssets } from './repository';
import { CODEC_LIMITS, RevisionCodec } from './codec';
import { validateRevisionDocument } from '../../domain/revisions/document';
function codecNumber(name: string, fallback: number, min: number, max: number) { const raw = process.env[name]; if (!raw)
    return fallback; const value = Number(raw); if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Configuração de limites do histórico inválida.'); return value; }
export function configuredRevisionService(additionalProviders: BlobStore[] = [], administrativeSource?:string) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default;
    if (!url || !key)
        throw new Error('Backend do histórico não configurado.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), store = new SupabaseBlobStore(client);
    const stores = new BlobStores(administrativeSource || process.env.REVISION_BLOB_PROVIDER || store.providerId, new Map<string, BlobStore>([[store.providerId, store], ...additionalProviders.map(provider => [provider.providerId, provider] as [
            string,
            BlobStore
        ])]));
    const codec = new RevisionCodec({ ...CODEC_LIMITS,
        deltaMaxRatio: codecNumber('REVISION_DELTA_MAX_RATIO', .7, .1, 1),
        maxChainBytes: codecNumber('REVISION_CHAIN_BYTES', 4194304, 1024, 16777216),
        maxReconstructMs: codecNumber('REVISION_RECONSTRUCT_MS', 100, 5, 5000) });
    return new RevisionService(new RevisionRepository(client, stores, codec));
}
const requestWindows = new Map<string, {
    start: number;
    count: number;
}>();
export async function revisionHandler(req: Request, res: Response) {
    return revisionHandlerWithOptions(req,res,{enabled:process.env.HISTORY_V12_ENABLED === 'true'});
}
export async function revisionHandlerWithOptions(req: Request, res: Response, options: {enabled:boolean}) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!options.enabled) {
        res.status(503).json({ error: 'Histórico v1.2 aguardando ativação e migração verificadas.' });
        return;
    }
    try {
        const service = configuredRevisionService(), token = req.headers.authorization?.replace(/^Bearer /i, '');
        if (!token) {
            res.status(401).json({ error: 'Sessão necessária.' });
            return;
        }
        const { data, error } = await service.repo.db.auth.getUser(token);
        if (error || !data.user) {
            res.status(401).json({ error: 'Sessão expirada; entre novamente.' });
            return;
        }
        const actor = data.user.id;
        const window = requestWindows.get(actor);
        if (window && Date.now() - window.start < 60000) {
            if (++window.count > 120) {
                res.status(429).json({ error: 'Muitas solicitações; aguarde um momento.' });
                return;
            }
        }
        else {
            if (requestWindows.size > 10000)
                requestWindows.clear();
            requestWindows.set(actor, { start: Date.now(), count: 1 });
        }
        const input = req.method === 'GET' ? req.query : req.body || {}, menuId = String(input.menuId || '');
        if (!menuId || menuId.length > 100)
            throw new Error('Cardápio inválido.');
        await service.repo.authorize(menuId, actor);
        const action = String(input.action || 'page');
        if (input.cursor && (!Number.isSafeInteger(Number(input.cursor)) || Number(input.cursor) < 1))
            throw new Error('Cursor inválido.');
        for (const key of ['since', 'until'])
            if (input[key] && !Number.isFinite(Date.parse(input[key])))
                throw new Error('Data inválida.');
        const mutation = !['page', 'load', 'status'].includes(action);
        if (mutation)
            await service.repo.rpc('revision_rate_limit', { p_actor: actor, p_menu: menuId });
        if (mutation && req.method !== 'POST') {
            res.status(405).json({ error: 'Método inválido.' });
            return;
        }
        if (mutation && (!input.operationId || !/^[a-zA-Z0-9:_-]{1,180}$/.test(input.operationId)))
            throw new Error('Identificador da operação inválido.');
        if (mutation) {
            const issued = Number(String(input.operationId).split('_')[0]);
            if (!Number.isSafeInteger(issued) || issued < Date.now() - 7 * 86400000 || issued > Date.now() + 86400000)
                throw new Error('Operação expirada ou relógio do dispositivo incorreto. Reabra o formulário antes de tentar novamente.');
        }
        if (mutation)
            input.operationId = `${action}:${input.operationId}`;
        let result: unknown;
        if (action === 'page') {
            if (!(await service.repo.runtime(menuId))?.migrated)
                await service.repo.db.from('revision_jobs').upsert({ menu_id: menuId, due_at: new Date().toISOString() }, { onConflict: 'menu_id', ignoreDuplicates: true });
            if (!['all', 'protected', 'important'].includes(String(input.filter || 'all')))
                throw new Error('Filtro inválido.');
            result = await service.repo.page(menuId, input.filter || 'all', input.cursor ? Number(input.cursor) : undefined, input.since, input.until);
        }
        else if (action === 'status') {
            result = { ready: !!(await service.repo.runtime(menuId))?.migrated, writeVersion: (await service.repo.menu(menuId)).revision_write_version };
        }
        else if (action === 'load') {
            const revision = await service.repo.metadata(menuId, String(input.revisionId));
            const namespace = await service.repo.authorize(menuId, actor);
            result = await service.repo.read(revision.state_id, namespace);
            res.setHeader('ETag', `"${revision.state_hash}"`);
        }
        else if (action === 'migrate') {
            result = { ready: await service.migrateBatch(menuId, actor) };
        }
        else if (action === 'publication-version') {
            validateRevisionDocument(input.snapshot);
            input.snapshot = await externalizeEmbeddedAssets(service.repo.db,await service.repo.authorize(menuId,actor),actor,input.snapshot);
            await service.ready(menuId, actor);
            await service.repo.codec.encode(input.snapshot);
            await service.repo.rpc('revision_assert_assets', { p_namespace: await service.repo.authorize(menuId, actor), p_assets: collectAssets(input.snapshot) });
            result = await service.repo.rpc('revision_published_version', { p_menu: menuId, p_actor: actor, p_editor: editorOf(input.snapshot), p_snapshot: input.snapshot, p_operation: input.operationId });
        }
        else if (action === 'save')
            result = await service.save(menuId, actor, input);
        else if (action === 'before-operation') {
            await service.ready(menuId, actor);
            result = await service.repo.checkpoint(menuId, actor, input.operationId, { priority: 3, kind: 'before', tags: ['Antes de alteração estrutural'] });
        }
        else if (action === 'manual') {
            await service.ready(menuId, actor);
            result = await service.repo.checkpoint(menuId, actor, input.operationId, { manual: true, name: input.name, defaultName: !!input.defaultName, expectedWrite: Number(input.expectedWrite), kind: 'manual' });
        }
        else if (action === 'protect')
            result = await service.protect(menuId, actor, input);
        else if (action === 'restore')
            result = await service.restore(menuId, actor, String(input.revisionId), Number(input.expectedWrite), input.operationId);
        else if (action === 'copy')
            result = await service.copy(menuId, actor, String(input.revisionId), input.operationId);
        else if (action === 'finalize') {
            await service.ready(menuId, actor);
            result = await service.repo.checkpoint(menuId, actor, input.operationId);
        }
        else if (action === 'published') {
            const publication = await service.repo.db.from('menu_publications').select('snapshot,published_version_id').eq('menu_id', menuId).single();
            if (publication.error)
                throw publication.error;
            result = await service.repo.checkpoint(menuId, actor, `publication:${publication.data.published_version_id}`, { priority: 2, kind: 'published', tags: ['Publicação'], advance: false }, publication.data.snapshot);
        }
        else
            throw new Error('Ação inválida.');
        res.json(result);
    }
    catch (error) {
        const reason = error as any;
        const conflict = reason?.code === '40001' || reason?.code === 'PT409' || /conflito/i.test(reason?.message || '');
        const forbidden = reason?.code === '42501';
        res.status(forbidden ? 403 : conflict ? 409 : 422).json({ error: reason?.message || 'Histórico indisponível.', code: conflict ? '40001' : reason?.code });
    }
}
export async function revisionWorkerHandler(req: Request, res: Response) {
    const secret = process.env.REVISION_WORKER_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        res.status(401).end();
        return;
    }
    if (process.env.HISTORY_V12_ENABLED !== 'true') {
        res.status(503).end();
        return;
    }
    try {
        const service = configuredRevisionService();
        const jobs = await service.runJobs(10);
        const rebase = process.env.REVISION_GC_ENABLED === 'true' ? await service.optimizeBases(3) : null;
        const gc = process.env.REVISION_GC_ENABLED === 'true' ? await service.gc(10) : null;
        res.json({ jobs, rebase, gc });
    }
    catch {
        res.status(503).json({ error: 'Falha no worker de histórico. Consulte métricas internas.' });
    }
}
