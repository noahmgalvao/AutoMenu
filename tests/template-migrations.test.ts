import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const seedPath = 'supabase/migrations/20261116120000_template_catalog.sql';
const favoritesPath = 'supabase/migrations/20261116120100_template_favorites.sql';
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';

test('versioned SQL seed matches the catalog manifest', async () => {
  const generated = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-template-catalog.mjs'], {encoding:'utf8'});
  assert.equal((await readFile(seedPath,'utf8')).replace(/\r\n/g,'\n').trim(), generated.trim());
});

test('catalog migration is idempotent and Postgres enforces favorite ownership and workspace access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${user}'), ('${other}');
      create table public.templates (
        id text primary key, workspace_id text, scope text, source_type text, name text,
        is_locked boolean, current_version_id text
      );
      create table public.template_versions (
        id text primary key, template_id text references public.templates(id), version_number integer,
        style_state jsonb, unique(template_id, version_number)
      );
      create function public.is_workspace_member(workspace text) returns boolean language sql stable as
        $$ select workspace = 'accessible' and auth.uid() = '${user}'::uuid $$;
      grant select on public.templates to authenticated;
      alter table public.templates enable row level security;
      create policy scope_read on public.templates for select to authenticated
        using (scope='system' or public.is_workspace_member(workspace_id));
      insert into public.templates (id, workspace_id, scope, source_type, name) values
        ('modern-clean',null,'system','preset','Legacy'), ('my-import','accessible','workspace','ai_import','Importado'),
        ('other-import','other','workspace','ai_import','Outro');
      insert into public.template_versions values ('original','my-import',1,'{"keep":"original"}');
    `);
    const seed = await readFile(seedPath,'utf8');
    await db.exec('begin;' + seed + 'commit;');
    await db.exec('begin;' + seed + 'commit;');
    assert.equal((await db.query<{count: string}>("select count(*) from public.templates where scope='system' and catalog_active")).rows[0].count, 50);
    assert.deepEqual((await db.query("select style_state from public.template_versions where id='original'")).rows,
      [{style_state:{keep:'original'}}]);
    await db.exec(await readFile(favoritesPath,'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`);
    await db.query('insert into public.template_favorites (user_id,template_id) values ($1,$2),($1,$3)',[user,'swiss-grid','my-import']);
    await db.query('insert into public.template_favorites (user_id,template_id) values ($1,$2) on conflict do nothing',[user,'swiss-grid']);
    await assert.rejects(db.query('insert into public.template_favorites (user_id,template_id) values ($1,$2)',[user,'other-import']), /row-level security/);
    await assert.rejects(db.query('insert into public.template_favorites (user_id,template_id) values ($1,$2)',[other,'swiss-grid']), /row-level security/);
    await assert.rejects(db.query('insert into public.template_favorites (user_id,template_id) values ($1,$2)',[user,'modern-clean']), /row-level security/);
    assert.equal((await db.query('select * from public.template_favorites')).rows.length,2);
    await db.exec(`set request.jwt.claim.sub = '${other}';`);
    assert.equal((await db.query('select * from public.template_favorites')).rows.length,0);
    assert.equal((await db.query('delete from public.template_favorites returning *')).rows.length,0);
    await db.exec(`set request.jwt.claim.sub = '${user}';`);
    assert.equal((await db.query('delete from public.template_favorites returning *')).rows.length,2);
  } finally {
    await db.close();
  }
});
