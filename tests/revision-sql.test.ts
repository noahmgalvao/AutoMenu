import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { ACTOR, revisionDatabase } from './support/revisionDatabase';
test('v1.2 migration is additive, idempotent, RLS metadata isolated and service functions private', async () => {
    const db = await revisionDatabase();
    try {
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.menu_versions')).rows[0].n, 1);
        await db.exec(`grant usage on schema auth to authenticated;grant select on public.menus to authenticated;set role authenticated;set request.jwt.claim.sub='${ACTOR}';`);
        assert.deepEqual((await db.query('select * from public.menu_revisions')).rows, []);
        await assert.rejects(db.query(`select public.revision_assert_actor('m','${ACTOR}')`), /permission denied/);
        await assert.rejects(db.query("select * from public.revision_blobs"), /permission denied/);
    }
    finally {
        await db.close();
    }
});
import { RevisionCodec } from '../src/infrastructure/revisions/codec';
const document = (n: number) => ({ products: [{ id: 'p', name: `Produto ${n}`, price: n, category: 'Categoria' }], style: { menuTitle: 'Cardápio' }, sortOption: { field: 'category', direction: 'asc' } });
async function stage(db: PGlite, n: number) {
    const e = await new RevisionCodec().encode(document(n)), bid = `b:${e.payloadHash}`;
    const state = { id: `s:${e.stateHash}`, namespace: 'w', state_hash: e.stateHash, schema_version: 1, representation: e.representation, base_state_id: e.baseStateId, chain_depth: e.depth, codec: e.codec, patch_version: 1, byte_length: e.bytes.length, raw_length: e.rawLength, payload_hash: e.payloadHash, blob_id: bid, chain_bytes: e.chainBytes };
    const blob = { id: bid, namespace: 'w', provider_id: 'test', bucket: 'private', object_key: e.payloadHash, byte_length: e.bytes.length, checksum: e.payloadHash, generation: 1 };
    await db.query(`insert into public.revision_blobs(id,namespace,provider_id,bucket,object_key,byte_length,checksum) values($1,'w','test','private',$2,$3,$4) on conflict do nothing`, [bid, e.payloadHash, e.bytes.length, e.payloadHash]);
    return { state, blob, assets: [] };
}
async function commit(db: PGlite, n: number, options: Record<string, unknown> = {}, op = `op${n}`, expected = 0) {
    const p = await stage(db, n);
    const result = await db.query<{
        r: any;
    }>('select public.revision_commit($1,$2,$3,$4,$5,$6,$7,$8) r', ['m', ACTOR, expected, op, p.state, p.blob, options, []]);
    return result.rows[0].r;
}
test('manual numbering, deduplication, quota and conflicting devices are transactional', async () => {
    const db = await revisionDatabase();
    try {
        const original = await commit(db, 0, { original: true, name: 'Primeira versão disponível' });
        await db.exec("update public.revision_menu_state set migrated=true where menu_id='m'");
        await assert.rejects(commit(db, 0, { manual: true, name: 'Versão 1', defaultName: true }, 'manual-original'), /já está protegido/);
        const first = await commit(db, 1, { manual: true, name: 'Meu nome' }, 'manual:1');
        assert.equal(first.name, 'Meu nome');
        const retry = await commit(db, 2, { manual: true, name: 'Outro' }, 'manual:1');
        assert.equal(retry.id, first.id);
        const second = await commit(db, 2, { manual: true, name: 'Versão 2', defaultName: true }, 'manual:2');
        assert.equal(second.name, 'Versão 2');
        assert.equal((await db.query<{
            manual_counter: number;
        }>("select manual_counter from public.revision_menu_state where menu_id='m'")).rows[0].manual_counter, 2);
        await db.exec('update public.revision_config set max_protected=2');
        await assert.rejects(commit(db, 3, { manual: true, name: 'Não cabe' }, 'manual:fail'), /Limite/);
        await assert.rejects(commit(db, 3, {}, 'bad-cas', 1), /Conflito/);
        await assert.rejects(db.query('select public.revision_protect($1,$2,$3,$4,false,false,$5)', ['m', ACTOR, first.id, null, 'unconfirmed']), /Confirme/);
        await db.query('select public.revision_protect($1,$2,$3,$4,false,true,$5)', ['m', ACTOR, first.id, null, 'unprotect']);
        const third = await commit(db, 3, { manual: true, name: 'Versão 3', defaultName: true }, 'manual:3');
        assert.equal(third.name, 'Versão 3');
        await assert.rejects(db.query('select public.revision_protect($1,$2,$3,$4,false,true,$5)', ['m', ACTOR, original.id, null, 'unprotect-original']), /Original/);
        assert.equal((await db.query<{
            n: number;
        }>("select count(*)::int n from public.menu_revisions where protection='user'")).rows[0].n, 2);
    }
    finally {
        await db.close();
    }
});
test('autosave coalesces durable state, A→B→A cancels pending work and CAS rejects silent overwrites', async () => {
    const db = await revisionDatabase();
    try {
        const original = await commit(db, 0, { original: true });
        await db.exec("update public.revision_menu_state set migrated=true where menu_id='m'");
        const save = async (n: number, expected: number, op: string) => db.query('select public.revision_save_draft($1,$2,$3,$4,$5,$6,$7)', ['m', ACTOR, expected, op, { style: document(n).style, freeTextProducts: [], sortOption: document(n).sortOption }, document(n), (await stage(db, n)).state.state_hash]);
        await save(1, 0, 'save1');
        await save(1, 0, 'save1');
        assert.equal((await db.query<{
            revision_write_version: number;
        }>("select revision_write_version from public.menus where id='m'")).rows[0].revision_write_version, 1);
        await assert.rejects(save(2, 0, 'old-device'), /Conflito/);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.menu_versions')).rows[0].n, 1);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_jobs')).rows[0].n, 1);
        await save(0, 1, 'return-a');
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_jobs')).rows[0].n, 0);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.menu_revisions')).rows[0].n, 1);
        assert.ok(original.id);
        await save(1, 2, 'save-b');
        const b = await commit(db, 1, {}, 'checkpoint-b', 3);
        await save(0, 3, 'save-a');
        const a = await commit(db, 0, {}, 'checkpoint-a', 4);
        assert.notEqual(a.id, original.id);
        assert.notEqual(a.id, b.id);
        assert.equal(a.state_id, original.state_id);
    }
    finally {
        await db.close();
    }
});
test('restore pre/post, safe retries, source leases, copy and publication isolation', async () => {
    const db = await revisionDatabase();
    try {
        const original = await commit(db, 0, { original: true });
        await db.exec("update public.revision_menu_state set migrated=true where menu_id='m'");
        await commit(db, 1);
        const pre = await stage(db, 1), post = await stage(db, 0);
        const restore = () => db.query<{
            r: any;
        }>('select public.revision_restore($1,$2,0,$3,$4,$5,$6,$7,$8,$9) r', ['m', ACTOR, 'restore:1', original.id, pre, post, { style: document(0).style, freeTextProducts: [], sortOption: document(0).sortOption }, document(0), []]);
        const restored = (await restore()).rows[0].r;
        assert.ok(restored.pre && restored.post);
        assert.deepEqual((await restore()).rows[0].r, restored);
        const menu = (await db.query<{
            published_version_id: null;
            revision_write_version: number;
        }>("select published_version_id,revision_write_version from public.menus where id='m'")).rows[0];
        assert.equal(menu.published_version_id, null);
        assert.equal(menu.revision_write_version, 1);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_leases')).rows[0].n, 1);
        const result = await db.query<{
            r: any;
        }>('select public.revision_copy($1,$2,$3,$4,$5,$6,$7,$8) r', ['m', ACTOR, original.id, 'copy:1', { style: document(0).style, freeTextProducts: [], sortOption: document(0).sortOption }, document(0), post, []]);
        assert.ok(result.rows[0].r.menuId);
        const copied = await db.query<{
            n: number;
            original: number;
        }>('select count(*)::int n,count(*) filter(where protection=\'original\')::int original from public.menu_revisions where menu_id=$1', [result.rows[0].r.menuId]);
        assert.deepEqual(copied.rows[0], { n: 1, original: 1 });
    }
    finally {
        await db.close();
    }
});
test('concurrent quotas, missing upload, capacity refusal and private RLS cannot manufacture success', async () => {
    const db = await revisionDatabase();
    try {
        await commit(db, 0, { original: true });
        await db.exec('update public.revision_config set max_protected=1');
        const results = await Promise.allSettled([commit(db, 1, { manual: true, name: 'A' }, 'race-a'), commit(db, 2, { manual: true, name: 'B' }, 'race-b')]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(results.filter(r => r.status === 'rejected').length, 1);
        const p = await stage(db, 5);
        await db.query('delete from public.revision_blobs where id=$1', [p.blob.id]);
        await assert.rejects(db.query('select public.revision_commit($1,$2,0,$3,$4,$5,$6,$7)', ['m', ACTOR, 'missing', p.state, p.blob, {}, []]), /Upload/);
        await db.exec(`update public.revision_config set capacity_level=95`);
        await assert.rejects(commit(db, 3, {}, 'pressure'), /capacidade/);
        const count = (await db.query<{
            manual_counter: number;
        }>("select manual_counter from public.revision_menu_state where menu_id='m'")).rows[0].manual_counter;
        assert.equal(count, 1);
        await db.exec(`grant usage on schema auth to authenticated;grant select on public.menus to authenticated;set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';`);
        assert.deepEqual((await db.query('select id from public.menu_revisions')).rows, []);
    }
    finally {
        await db.close();
    }
});
test('logical compaction keeps physical delta bases, verified rebase and GC respect read/backup leases', async () => {
    const db = await revisionDatabase();
    try {
        await db.exec('update public.revision_config set max_automatic=1,recent_reserve=1,milestone_reserve=0,grace_seconds=0');
        const codec = new RevisionCodec();
        const doc = (n: number) => ({ products: Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, name: `Produto ${i}`, price: i === 2 ? n : i, description: `Ingredientes ${i} e temperos frescos` })), style: { menuTitle: 'Cardápio' } });
        let base: any;
        async function add(n: number, options: any = {}) {
            const e = await codec.encode(doc(n), base), bid = `chain-b${n}`, state = { id: `chain-s${n}`, namespace: 'w', state_hash: e.stateHash, schema_version: 1, representation: e.representation, base_state_id: e.baseStateId, chain_depth: e.depth, codec: e.codec, patch_version: 1, byte_length: e.bytes.length, raw_length: e.rawLength, payload_hash: e.payloadHash, blob_id: bid, chain_bytes: e.chainBytes };
            const blob = { id: bid, checksum: e.payloadHash };
            await db.query("insert into public.revision_blobs(id,namespace,provider_id,bucket,object_key,byte_length,checksum) values($1,'w','test','private',$1,$2,$3)", [bid, e.bytes.length, e.payloadHash]);
            const r = (await db.query<{
                r: any;
            }>('select public.revision_commit($1,$2,0,$3,$4,$5,$6,$7) r', ['m', ACTOR, `chain-op${n}`, state, blob, options, []])).rows[0].r;
            base = { state, document: doc(n) };
            return { r, state, e };
        }
        const original = await add(0, { original: true });
        const middle = await add(1);
        const last = await add(2);
        assert.equal(last.state.representation, 'delta');
        await db.query('select public.revision_compact($1,$2,4,$3,$4)', ['m', ACTOR, [last.r.id], []]);
        assert.equal((await db.query<{
            n: number;
        }>("select count(*)::int n from public.menu_revisions where protection is null")).rows[0].n, 1);
        await db.exec("update public.revision_blobs set lease_until=now()-interval '1 second';update public.revision_states set created_at=now()-interval '1 hour'");
        await db.query('select * from public.revision_gc(20)');
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_states')).rows[0].n, 3);
        const candidates = await db.query<{
            r: any;
        }>('select public.revision_rebase_candidates(3) r');
        assert.ok(candidates.rows[0].r.some((candidate: any) => candidate.state.id === last.state.id));
        const chain = await db.query<{
            r: any;
        }>('select public.revision_read_chain($1,$2,$3) r', [last.state.id, 'w', 'reader']);
        assert.equal(chain.rows[0].r.length, 3);
        const snapshot = await codec.encode(doc(2), undefined, true), newBlob = 'rebased';
        await db.query("insert into public.revision_blobs(id,namespace,provider_id,bucket,object_key,byte_length,checksum) values($1,'w','test','private',$1,$2,$3)", [newBlob, snapshot.bytes.length, snapshot.payloadHash]);
        await assert.rejects(db.query('select public.revision_rebase($1,1,$2,$3)', [last.state.id, newBlob, { state_hash: 'bad', codec: snapshot.codec, raw_length: snapshot.rawLength }]), /Rebase/);
        await db.query('select public.revision_rebase($1,1,$2,$3)', [last.state.id, newBlob, { state_hash: last.state.state_hash, codec: snapshot.codec, raw_length: snapshot.rawLength }]);
        assert.equal((await db.query<{
            state_hash: string;
        }>('select state_hash from public.revision_states where id=$1', [last.state.id])).rows[0].state_hash, last.state.state_hash);
        await db.query('select * from public.revision_gc(20)');
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_states')).rows[0].n, 2);
        assert.equal((await db.query<{
            status: string;
        }>('select status from public.revision_blobs where id=$1', [middle.state.blob_id])).rows[0].status, 'ready');
        await db.exec("delete from public.revision_leases where id='reader';update public.revision_blobs set lease_until=now()-interval '1 second'");
        await db.query('select * from public.revision_gc(20)');
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_states')).rows[0].n, 2);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_states where id=$1', [original.state.id])).rows[0].n, 1);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_states where id=$1', [middle.state.id])).rows[0].n, 0);
        await db.exec("insert into public.revision_leases(id) values('backup:test')");
        assert.equal((await db.query('select * from public.revision_gc(20)')).rows.length, 0);
    }
    finally {
        await db.close();
    }
});
test('asset ledger includes all nested references and arrays, GC requires completed inventory and refuses referenced assets', async () => {
    const db = await revisionDatabase();
    try {
        await db.exec(`insert into public.assets(id,workspace_id,metadata,created_at,bucket,path) values('used','w','{"immutable":true,"revision_asset":true}',now()-interval '1 day','private','a'),('orphan','w','{"immutable":true,"revision_asset":true}',now()-interval '1 day','private','b')`);
        assert.deepEqual((await db.query<{
            id: string;
        }>("select public.revision_document_assets('{\"asset_ids\":[\"used\"],\"nested\":{\"imageAssetId\":\"orphan\"}}') id order by id")).rows.map(r => r.id), ['orphan', 'used']);
        await db.exec(`update public.menu_versions set render_snapshot='{"style":{"addedImages":[{"assetId":"used"}]},"products":[]}' where id='v'`);
        assert.equal((await db.query('select * from public.revision_gc_assets(10)')).rows.length, 0);
        await db.exec('update public.revision_config set asset_inventory_complete=true,grace_seconds=0');
        const candidates = await db.query<{
            id: string;
        }>('select * from public.revision_gc_assets(10)');
        assert.deepEqual(candidates.rows.map(r => r.id), ['orphan']);
        await assert.rejects(db.query("insert into public.revision_asset_refs values('state','late','orphan')"), /em coleta/);
        assert.equal((await db.query<{
            n: number;
        }>("select count(*)::int n from public.revision_asset_refs where asset_id='used'")).rows[0].n, 1);
    }
    finally {
        await db.close();
    }
});
test('resource reservations and capacity alerts are atomic; stale emergency metrics do not imply recovery', async () => {
    const db = await revisionDatabase();
    try {
        const metrics = (used: number, at = new Date().toISOString()) => ({ storage: { used, limit: 100000, observedAt: at, source: 'fixture' } });
        for (const [used, level] of [[50000, 50], [70000, 70], [85000, 85], [95000, 95]]) {
            const result = await db.query<{
                r: number;
            }>('select public.revision_record_metrics($1,true) r', [metrics(used)]);
            assert.equal(result.rows[0].r, level);
        }
        assert.equal((await db.query<{
            r: number;
        }>('select public.revision_record_metrics($1,true) r', [metrics(95000, '2000-01-01T00:00:00Z')])).rows[0].r, 95);
        assert.equal((await db.query<{
            r: number;
        }>('select public.revision_record_metrics($1,true) r', [metrics(79000)])).rows[0].r, 70);
        await db.query('select public.revision_reserve($1,$2,$3)', ['reservation1', 'w', 10000]);
        await assert.rejects(db.query('select public.revision_reserve($1,$2,$3)', ['reservation2', 'w', 10000]), /capacidade/);
        await db.query('select public.revision_reserve($1,$2,$3)', ['reservation1', 'w', 10000]);
        await assert.rejects(db.query('select public.revision_reserve($1,$2,$3)', ['reservation1', 'other', 10000]), /divergente/);
        await db.exec("insert into public.assets(id,workspace_id) values('own','w'),('foreign','other')");
        await db.query('select public.revision_assert_assets($1,$2)', ['w', ['own']]);
        await assert.rejects(db.query('select public.revision_assert_assets($1,$2)', ['w', ['foreign']]), /não autorizado/);
        const summary = await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_capacity_alerts');
        assert.ok(summary.rows[0].n >= 4);
    }
    finally {
        await db.close();
    }
});
test('durable grouping schedules first 5min/90s deadline and worker claims exclude active leases', async () => {
    const db = await revisionDatabase();
    try {
        await commit(db, 0, { original: true });
        await db.exec("update public.revision_menu_state set migrated=true where menu_id='m'");
        const save = async (n: number, expected: number) => db.query('select public.revision_save_draft($1,$2,$3,$4,$5,$6,$7)', ['m', ACTOR, expected, `timer${n}`, { style: document(n).style, freeTextProducts: [], sortOption: document(n).sortOption }, document(n), (await stage(db, n)).state.state_hash]);
        await save(1, 0);
        const first = (await db.query<{
            seconds: number;
        }>("select extract(epoch from due_at-now())::float8 seconds from public.revision_jobs where menu_id='m'")).rows[0].seconds;
        assert.ok(first > 88 && first <= 90);
        await db.exec("update public.revision_menu_state set pending_first=now()-interval '301 seconds' where menu_id='m'");
        await save(2, 1);
        const overdue = (await db.query<{
            seconds: number;
        }>("select extract(epoch from due_at-now())::float8 seconds from public.revision_jobs where menu_id='m'")).rows[0].seconds;
        assert.ok(overdue < 0);
        assert.equal((await db.query("select * from public.revision_claim_jobs('worker-a',10)")).rows.length, 1);
        assert.equal((await db.query("select * from public.revision_claim_jobs('worker-b',10)")).rows.length, 0);
    }
    finally {
        await db.close();
    }
});
test('authorized workspace deletion can cascade owned revision references without breaking Auth cleanup', async () => {
    const db = await revisionDatabase();
    try {
        const original = await commit(db, 0, { original: true });
        await db.exec("insert into public.assets(id,workspace_id) values('owned','w')");
        await db.query("insert into public.revision_asset_refs values('state',$1,'owned')", [original.state_id]);
        await db.exec("delete from public.workspaces where id='w'");
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.menu_revisions')).rows[0].n, 0);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from public.revision_asset_refs')).rows[0].n, 0);
    }
    finally {
        await db.close();
    }
});

test('older hosted schemas without optional catalog backgrounds preserve owned assets and deny foreign assets', async () => {
 const db=await revisionDatabase();try {
 await db.exec("drop table public.catalog_template_backgrounds;insert into public.assets(id,workspace_id) values('own','w'),('foreign','other')");
 await db.query('select public.revision_assert_assets($1,$2)',['w',['own']]);
 await assert.rejects(db.query('select public.revision_assert_assets($1,$2)',['w',['foreign']]),/não autorizado/);
 const staged=await stage(db,0);
 const result=await db.query<{r:any}>('select public.revision_commit($1,$2,0,$3,$4,$5,$6,$7) r',['m',ACTOR,'old-schema',staged.state,staged.blob,{original:true},['own']]);
 assert.equal(result.rows[0].r.protection,'original');
 }finally{await db.close();}
});

test('Edge telemetry distinguishes unavailable CPU/memory from measured zero', async () => {
 const db=await revisionDatabase();try {
 const sql=await readFile('supabase/migrations/20261126204608_revision_history_edge_runtime.sql','utf8');
 const start=sql.indexOf('alter table public.revision_telemetry');
 const end=sql.indexOf('do $$begin',start);
 await db.exec(sql.slice(start,end));
 await db.query('select public.revision_observe($1,10,null,30,null)',['w']);
 const row=(await db.query<{samples:number,cpu_samples:number,memory_samples:number}>('select samples::int,cpu_samples::int,memory_samples::int from public.revision_telemetry')).rows[0];
 assert.deepEqual(row,{samples:1,cpu_samples:0,memory_samples:0});
 await db.query('select public.revision_observe($1,10,0,30,0)',['w']);
 const measured=(await db.query<{samples:number,cpu_samples:number,memory_samples:number}>('select samples::int,cpu_samples::int,memory_samples::int from public.revision_telemetry')).rows[0];
 assert.deepEqual(measured,{samples:2,cpu_samples:1,memory_samples:1});
 }finally{await db.close();}
});

test('global worker admission counts other workers leases and prioritizes persisted editing over legacy backfill', async () => {
 const db=await revisionDatabase();try{
 await commit(db,0,{original:true});
 await db.exec("update public.revision_menu_state set migrated=true where menu_id='m';update public.revision_config set max_worker_concurrency=2;insert into public.revision_jobs(menu_id,due_at) values('m',now()-interval '1 second'),('foreign',now()-interval '1 hour') on conflict(menu_id) do update set due_at=excluded.due_at;");
 const first=await db.query<{menu_id:string}>("select * from public.revision_claim_jobs('worker-a',1)");
 assert.equal(first.rows[0].menu_id,'m');
 const second=await db.query<{menu_id:string}>("select * from public.revision_claim_jobs('worker-b',20)");
 assert.deepEqual(second.rows.map(r=>r.menu_id),['foreign']);
 assert.equal((await db.query("select * from public.revision_claim_jobs('worker-c',20)")).rows.length,0);
 await db.exec("update public.revision_jobs set lease_until=null,lease_token=null;update public.revision_config set capacity_level=85;");
 assert.equal((await db.query("select * from public.revision_claim_jobs('worker-d',20)")).rows.length,1);
 assert.equal((await db.query("select * from public.revision_claim_jobs('worker-e',20)")).rows.length,0);
 await db.exec('update public.revision_config set capacity_level=95');
 assert.equal((await db.query("select * from public.revision_claim_jobs('worker-f',20)")).rows.length,0);
 }finally{await db.close();}
});
