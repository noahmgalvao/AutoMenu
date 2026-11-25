import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const legacySeedPath = 'supabase/migrations/20261116120000_template_catalog.sql';
const seedPath = 'supabase/migrations/20261121150000_template_catalog_v3.sql';
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
    await db.exec('begin;' + await readFile(legacySeedPath, 'utf8') + 'commit;');
    const seed = await readFile(seedPath,'utf8');
    await db.exec('begin;' + seed + 'commit;');
    await db.exec('begin;' + seed + 'commit;');
    assert.equal((await db.query<{count: string}>("select count(*) from public.templates where scope='system' and catalog_active")).rows[0].count, 50);
    assert.equal((await db.query<{count: number}>("select count(*)::int from public.template_versions where template_id='swiss-grid'")).rows[0].count, 2);
    assert.equal((await db.query("select id from public.templates where id='sem-modelo'")).rows.length, 0);
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

test('Postgres restricts custom marker reads and writes to their owner', async () => {
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
    `);
    await db.exec(await readFile('supabase/migrations/20261120040000_custom_menu_markers.sql', 'utf8'));
    const id = '00000000-0000-0000-0000-000000000003';
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`);
    await db.query("insert into public.custom_menu_markers (user_id,id,shape) values ($1,$2,'{\"kind\":\"star\"}')", [user, id]);
    await assert.rejects(db.query("insert into public.custom_menu_markers (user_id,id,shape) values ($1,$2,'{}')", [other, id]), /row-level security/);
    await db.exec(`set request.jwt.claim.sub = '${other}';`);
    assert.equal((await db.query('select id from public.custom_menu_markers')).rows.length, 0);
    assert.equal((await db.query('delete from public.custom_menu_markers returning id')).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub = '${user}';`);
    assert.deepEqual((await db.query('delete from public.custom_menu_markers returning id')).rows, [{ id }]);
  } finally {
    await db.close();
  }
});

test('archiving a menu hides its public link until the menu is restored', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create table public.menus(id text primary key, status text not null);
      create table public.menu_publications(menu_id text unique references public.menus(id));
      alter table public.menu_publications enable row level security;
      create policy menu_publications_public_read on public.menu_publications for select using (true);
      grant select on public.menu_publications to anon;
      grant select, insert, update on public.menu_publications to authenticated;
      create policy insert_publication on public.menu_publications for insert with check (true);
      create policy update_publication on public.menu_publications for update using (true);
      insert into public.menus values ('original', 'published'), ('other', 'published');
      insert into public.menu_publications values ('other');
    `);
    await db.exec(await readFile('supabase/migrations/20261121110000_hide_archived_menu_publications.sql', 'utf8'));
    await db.exec('set role authenticated');
    await assert.rejects(db.exec("insert into menu_publications values ('original') on conflict (menu_id) do update set menu_id = excluded.menu_id"), { code: '42501' });
    await db.exec("insert into menu_publications values ('original'); set role anon");
    assert.deepEqual((await db.query('select menu_id from public.menu_publications order by menu_id')).rows,
      [{ menu_id: 'original' }, { menu_id: 'other' }]);
    await db.exec("reset role; update public.menus set status = 'archived' where id = 'original'; set role anon");
    assert.deepEqual((await db.query('select menu_id from public.menu_publications')).rows, [{ menu_id: 'other' }]);
    await db.exec("reset role; update public.menus set status = 'published' where id = 'original'; set role anon");
    assert.deepEqual((await db.query('select menu_id from public.menu_publications order by menu_id')).rows,
      [{ menu_id: 'original' }, { menu_id: 'other' }]);
  } finally {
    await db.close();
  }
});

test('only the verified catalog admin can publish a private model, once, without exposing its contents', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, storage to authenticated;
      insert into auth.users values
        ('${user}', 'noahmgalvao@gmail.com', now()), ('${other}', 'other@example.test', now());
      create table public.templates (
        id text primary key default gen_random_uuid()::text, workspace_id text, scope text,
        name text, source_type text, current_version_id text, is_locked boolean, catalog_active boolean
      );
      create table public.template_versions (
        id text primary key default gen_random_uuid()::text, template_id text references public.templates(id),
        version_number int, style_state jsonb, preview_asset_id text
      );
      create table public.assets (id text primary key, workspace_id text, asset_type text, bucket text, path text, source_url text);
      create table storage.objects (bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select on storage.objects to authenticated;
      create function public.is_workspace_member(workspace text) returns boolean language sql stable as
        $$ select workspace = 'mine' and auth.uid() = '${user}'::uuid $$;
      insert into public.templates values
        ('original', 'mine', 'workspace', 'Casa', 'user', 'version', false, false),
        ('other-model', 'theirs', 'workspace', 'Outro', 'user', null, false, false);
      insert into public.assets values
        ('bg', 'mine', 'menu_background', 'menu-assets', 'mine/menu_background/bg.png', null);
      insert into storage.objects values
        ('menu-assets', 'mine/menu_background/bg.png'), ('menu-assets', 'mine/menu_background/private.png');
      insert into public.template_versions values ('version', 'original', 1,
        '{"fontFamily":"Inter","menuTitle":"Confidencial","sourceAssetId":"secret","addedImages":[{}],
          "backgroundAssetId":"bg","textContrastFills":{"freeText:note":"#000000","productName":"#ffffff"}}', 'bg');
    `);
    await db.exec(await readFile('supabase/migrations/20261123190000_publish_workspace_templates.sql', 'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${other}';`);
    assert.deepEqual((await db.query('select public.is_template_catalog_admin() as allowed')).rows, [{ allowed: false }]);
    await assert.rejects(db.query("select public.publish_workspace_template('original')"), /Somente administradores/);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await db.exec(`reset role; update auth.users set email_confirmed_at = null where id = '${user}';
      set role authenticated; set request.jwt.claim.sub = '${user}';`);
    await assert.rejects(db.query("select public.publish_workspace_template('original')"), /Somente administradores/);
    await db.exec(`reset role; update auth.users set email_confirmed_at = now() where id = '${user}'; set role authenticated;`);
    await assert.rejects(db.query("select public.publish_workspace_template('other-model')"), /Modelo indisponível/);
    const publish = () => db.query<{ model: Record<string, unknown> }>("select public.publish_workspace_template('original') as model");
    const result = (await publish()).rows[0].model;
    assert.deepEqual((await publish()).rows[0].model, result);
    assert.equal(result.scope, 'system');
    assert.equal(result.catalog_active, true);
    assert.equal(result.catalog_source_template_id, 'original');
    assert.deepEqual(result.style_state, {
      fontFamily: 'Inter', menuTitle: '', menuSubtitle: '', hiddenProductIds: [], backgroundAssetId: 'bg',
      textContrastFills: { productName: '#ffffff' },
    });
    await db.exec(`set request.jwt.claim.sub = '${other}';`);
    assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'mine/menu_background/bg.png' }]);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query("select public.publish_workspace_template('original')"), /permission denied/);
    await db.exec('reset role;');
    assert.deepEqual((await db.query("select scope from public.templates where id = 'original'")).rows, [{ scope: 'workspace' }]);
  } finally {
    await db.close();
  }
});
