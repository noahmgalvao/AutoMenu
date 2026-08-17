create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$
begin
  create type public.workspace_status as enum ('active', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.workspace_role as enum ('owner', 'member');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.menu_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.menu_version_type as enum ('draft', 'snapshot', 'published');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.template_scope as enum ('system', 'workspace');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.template_source_type as enum ('preset', 'user', 'ai_import');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.asset_type as enum (
    'product_image',
    'menu_background',
    'added_image',
    'ai_source_image',
    'ai_extracted_asset',
    'template_preview'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.ai_import_status as enum ('pending', 'processing', 'completed', 'failed');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(unaccent(input)), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'item'
  );
$$;

create table if not exists public.workspaces (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status public.workspace_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  default_workspace_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_default_workspace_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_default_workspace_id_fkey
      foreign key (default_workspace_id) references public.workspaces(id) on delete set null;
  end if;
end $$;

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

create table if not exists public.assets (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  bucket text,
  path text,
  source_url text,
  asset_type public.asset_type not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint assets_storage_or_source_chk check (
    source_url is not null or (bucket is not null and path is not null)
  )
);

create table if not exists public.catalog_categories (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_categories_workspace_slug_key unique (workspace_id, slug)
);

create table if not exists public.catalog_products (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  category_id text not null references public.catalog_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  base_price numeric(10, 2) not null default 0,
  primary_asset_id text references public.assets(id) on delete set null,
  sort_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.menus (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  status public.menu_status not null default 'draft',
  current_draft_version_id text,
  published_version_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.menu_versions (
  id text primary key default gen_random_uuid()::text,
  menu_id text not null references public.menus(id) on delete cascade,
  version_number integer not null,
  version_type public.menu_version_type not null default 'snapshot',
  editor_state jsonb not null default '{}'::jsonb,
  render_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint menu_versions_menu_id_version_number_key unique (menu_id, version_number)
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'menus'
      and constraint_name = 'menus_current_draft_version_id_fkey'
  ) then
    alter table public.menus
      add constraint menus_current_draft_version_id_fkey
      foreign key (current_draft_version_id) references public.menu_versions(id) on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'menus'
      and constraint_name = 'menus_published_version_id_fkey'
  ) then
    alter table public.menus
      add constraint menus_published_version_id_fkey
      foreign key (published_version_id) references public.menu_versions(id) on delete set null;
  end if;
end $$;

create table if not exists public.templates (
  id text primary key default gen_random_uuid()::text,
  workspace_id text references public.workspaces(id) on delete cascade,
  scope public.template_scope not null,
  name text not null,
  source_type public.template_source_type not null default 'user',
  current_version_id text,
  is_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.template_versions (
  id text primary key default gen_random_uuid()::text,
  template_id text not null references public.templates(id) on delete cascade,
  version_number integer not null,
  style_state jsonb not null default '{}'::jsonb,
  preview_asset_id text references public.assets(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint template_versions_template_id_version_number_key unique (template_id, version_number)
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'templates'
      and constraint_name = 'templates_current_version_id_fkey'
  ) then
    alter table public.templates
      add constraint templates_current_version_id_fkey
      foreign key (current_version_id) references public.template_versions(id) on delete set null;
  end if;
end $$;

create table if not exists public.ai_import_jobs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  source_asset_id text references public.assets(id) on delete set null,
  status public.ai_import_status not null default 'pending',
  provider text not null default 'google',
  model text not null default 'gemini-2.5-flash',
  raw_response jsonb not null default '{}'::jsonb,
  normalized_result jsonb not null default '{}'::jsonb,
  created_template_id text references public.templates(id) on delete set null,
  created_menu_id text references public.menus(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_default_workspace_id on public.profiles(default_workspace_id);
create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);
create index if not exists idx_assets_workspace_id on public.assets(workspace_id);
create index if not exists idx_catalog_categories_workspace_id on public.catalog_categories(workspace_id);
create index if not exists idx_catalog_products_workspace_id on public.catalog_products(workspace_id);
create index if not exists idx_catalog_products_category_id on public.catalog_products(category_id);
create index if not exists idx_menus_workspace_id on public.menus(workspace_id);
create index if not exists idx_menu_versions_menu_id on public.menu_versions(menu_id);
create index if not exists idx_templates_workspace_id on public.templates(workspace_id);
create index if not exists idx_template_versions_template_id on public.template_versions(template_id);
create index if not exists idx_ai_import_jobs_workspace_id on public.ai_import_jobs(workspace_id);

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_workspace_members_updated_at on public.workspace_members;
create trigger set_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_categories_updated_at on public.catalog_categories;
create trigger set_catalog_categories_updated_at
before update on public.catalog_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_products_updated_at on public.catalog_products;
create trigger set_catalog_products_updated_at
before update on public.catalog_products
for each row execute function public.set_updated_at();

drop trigger if exists set_menus_updated_at on public.menus;
create trigger set_menus_updated_at
before update on public.menus
for each row execute function public.set_updated_at();

drop trigger if exists set_templates_updated_at on public.templates;
create trigger set_templates_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_import_jobs_updated_at on public.ai_import_jobs;
create trigger set_ai_import_jobs_updated_at
before update on public.ai_import_jobs
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

create or replace function public.storage_workspace_id(object_name text)
returns text
language sql
immutable
as $$
  select nullif(split_part(object_name, '/', 1), '');
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.assets enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.menus enable row level security;
alter table public.menu_versions enable row level security;
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.ai_import_jobs enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert_owner on public.workspace_members;
create policy workspace_members_insert_owner on public.workspace_members
for insert to authenticated
with check (public.is_workspace_owner(workspace_id));

drop policy if exists workspace_members_update_owner on public.workspace_members;
create policy workspace_members_update_owner on public.workspace_members
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

drop policy if exists workspace_members_delete_owner on public.workspace_members;
create policy workspace_members_delete_owner on public.workspace_members
for delete to authenticated
using (public.is_workspace_owner(workspace_id));

drop policy if exists assets_select_member on public.assets;
create policy assets_select_member on public.assets
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists assets_insert_member on public.assets;
create policy assets_insert_member on public.assets
for insert to authenticated
with check (public.is_workspace_member(workspace_id));

drop policy if exists assets_update_member on public.assets;
create policy assets_update_member on public.assets
for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists assets_delete_member on public.assets;
create policy assets_delete_member on public.assets
for delete to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists catalog_categories_all_member on public.catalog_categories;
create policy catalog_categories_all_member on public.catalog_categories
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists catalog_products_all_member on public.catalog_products;
create policy catalog_products_all_member on public.catalog_products
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists menus_all_member on public.menus;
create policy menus_all_member on public.menus
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists menu_versions_select_member on public.menu_versions;
create policy menu_versions_select_member on public.menu_versions
for select to authenticated
using (
  exists (
    select 1
    from public.menus m
    where m.id = menu_id
      and public.is_workspace_member(m.workspace_id)
  )
);

drop policy if exists menu_versions_insert_member on public.menu_versions;
create policy menu_versions_insert_member on public.menu_versions
for insert to authenticated
with check (
  exists (
    select 1
    from public.menus m
    where m.id = menu_id
      and public.is_workspace_member(m.workspace_id)
  )
);

drop policy if exists templates_select_scope on public.templates;
create policy templates_select_scope on public.templates
for select to authenticated
using (
  scope = 'system'
  or public.is_workspace_member(workspace_id)
);

drop policy if exists templates_write_member on public.templates;
create policy templates_write_member on public.templates
for all to authenticated
using (
  scope = 'workspace'
  and public.is_workspace_member(workspace_id)
)
with check (
  scope = 'workspace'
  and public.is_workspace_member(workspace_id)
);

drop policy if exists template_versions_select_scope on public.template_versions;
create policy template_versions_select_scope on public.template_versions
for select to authenticated
using (
  exists (
    select 1
    from public.templates t
    where t.id = template_id
      and (t.scope = 'system' or public.is_workspace_member(t.workspace_id))
  )
);

drop policy if exists template_versions_write_member on public.template_versions;
create policy template_versions_write_member on public.template_versions
for all to authenticated
using (
  exists (
    select 1
    from public.templates t
    where t.id = template_id
      and t.scope = 'workspace'
      and public.is_workspace_member(t.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.templates t
    where t.id = template_id
      and t.scope = 'workspace'
      and public.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists ai_import_jobs_all_member on public.ai_import_jobs;
create policy ai_import_jobs_all_member on public.ai_import_jobs
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', false),
  ('menu-assets', 'menu-assets', false),
  ('ai-imports', 'ai-imports', false)
on conflict (id) do nothing;

drop policy if exists storage_read_workspace_files on storage.objects;
create policy storage_read_workspace_files on storage.objects
for select to authenticated
using (
  bucket_id in ('product-images', 'menu-assets', 'ai-imports')
  and public.is_workspace_member(public.storage_workspace_id(name))
);

drop policy if exists storage_insert_workspace_files on storage.objects;
create policy storage_insert_workspace_files on storage.objects
for insert to authenticated
with check (
  bucket_id in ('product-images', 'menu-assets', 'ai-imports')
  and public.is_workspace_member(public.storage_workspace_id(name))
);

drop policy if exists storage_update_workspace_files on storage.objects;
create policy storage_update_workspace_files on storage.objects
for update to authenticated
using (
  bucket_id in ('product-images', 'menu-assets', 'ai-imports')
  and public.is_workspace_member(public.storage_workspace_id(name))
)
with check (
  bucket_id in ('product-images', 'menu-assets', 'ai-imports')
  and public.is_workspace_member(public.storage_workspace_id(name))
);

drop policy if exists storage_delete_workspace_files on storage.objects;
create policy storage_delete_workspace_files on storage.objects
for delete to authenticated
using (
  bucket_id in ('product-images', 'menu-assets', 'ai-imports')
  and public.is_workspace_member(public.storage_workspace_id(name))
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_id text := gen_random_uuid()::text;
  workspace_name text := coalesce(nullif(new.raw_user_meta_data ->> 'workspace_name', ''), split_part(new.email, '@', 1) || ' Workspace');
  workspace_slug text := public.slugify(workspace_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  resolved_full_name text := nullif(new.raw_user_meta_data ->> 'full_name', '');
begin
  insert into public.workspaces (id, name, slug, owner_user_id, status)
  values (workspace_id, workspace_name, workspace_slug, new.id, 'active');

  insert into public.profiles (user_id, full_name, default_workspace_id)
  values (new.id, resolved_full_name, workspace_id);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.templates (id, workspace_id, scope, name, source_type, current_version_id, is_locked)
values
  ('modern-clean', null, 'system', 'Modern Clean', 'preset', null, true),
  ('elegant-dark', null, 'system', 'Elegant Bistro', 'preset', null, true),
  ('casual-grid', null, 'system', 'Cozy Cafe', 'preset', null, true),
  ('rustic-cards', null, 'system', 'Rustic House', 'preset', null, true)
on conflict (id) do update
set
  name = excluded.name,
  scope = excluded.scope,
  source_type = excluded.source_type,
  current_version_id = excluded.current_version_id,
  is_locked = excluded.is_locked;

insert into public.template_versions (id, template_id, version_number, style_state, preview_asset_id)
values
  (
    'modern-clean-v1',
    'modern-clean',
    1,
    '{
      "id": "modern-clean",
      "name": "Modern Clean",
      "scope": "system",
      "sourceType": "preset",
      "isLocked": true,
      "menuTitle": "MENU",
      "menuSubtitle": "Signature Selection",
      "fontFamily": "Inter",
      "primaryColor": "#ea580c",
      "backgroundColor": "#ffffff",
      "textColor": "#1e293b",
      "layoutMode": "list",
      "showImages": true,
      "columnCount": 1,
      "backgroundImage": "",
      "customCategoryOrder": [],
      "customProductOrder": {},
      "hiddenProductIds": [],
      "floatingText": [],
      "pageBreaks": [],
      "elementStyles": {
        "category": { "fontSize": 24, "fontWeight": "700", "textAlign": "left", "color": "#ea580c" },
        "productName": { "fontSize": 18, "fontWeight": "700", "textAlign": "left", "color": "#1e293b" },
        "productPrice": { "fontSize": 18, "fontWeight": "700", "textAlign": "right", "color": "#059669" },
        "productDescription": { "fontSize": 14, "fontWeight": "400", "textAlign": "left", "color": "#64748b" }
      }
    }'::jsonb,
    null
  ),
  (
    'elegant-dark-v1',
    'elegant-dark',
    1,
    '{
      "id": "elegant-dark",
      "name": "Elegant Bistro",
      "scope": "system",
      "sourceType": "preset",
      "isLocked": true,
      "menuTitle": "Gourmet",
      "menuSubtitle": "Fine Dining Experience",
      "fontFamily": "Playfair Display",
      "primaryColor": "#fbbf24",
      "backgroundColor": "#1c1917",
      "textColor": "#f5f5f4",
      "layoutMode": "list",
      "showImages": false,
      "columnCount": 2,
      "backgroundImage": "https://www.transparenttextures.com/patterns/asfalt-dark.png",
      "customCategoryOrder": [],
      "customProductOrder": {},
      "hiddenProductIds": [],
      "floatingText": [],
      "pageBreaks": [],
      "elementStyles": {
        "category": { "fontSize": 24, "fontWeight": "700", "textAlign": "center", "color": "#fbbf24" },
        "productName": { "fontSize": 18, "fontWeight": "700", "textAlign": "left", "color": "#f5f5f4" },
        "productPrice": { "fontSize": 18, "fontWeight": "700", "textAlign": "right", "color": "#fbbf24" },
        "productDescription": { "fontSize": 14, "fontWeight": "400", "textAlign": "left", "color": "#a8a29e" }
      }
    }'::jsonb,
    null
  ),
  (
    'casual-grid-v1',
    'casual-grid',
    1,
    '{
      "id": "casual-grid",
      "name": "Cozy Cafe",
      "scope": "system",
      "sourceType": "preset",
      "isLocked": true,
      "menuTitle": "CAFE",
      "menuSubtitle": "Coffee & Bites",
      "fontFamily": "Lato",
      "primaryColor": "#0ea5e9",
      "backgroundColor": "#f0f9ff",
      "textColor": "#0f172a",
      "layoutMode": "grid",
      "showImages": true,
      "columnCount": 3,
      "backgroundImage": "",
      "customCategoryOrder": [],
      "customProductOrder": {},
      "hiddenProductIds": [],
      "floatingText": [],
      "pageBreaks": [],
      "elementStyles": {
        "category": { "fontSize": 24, "fontWeight": "700", "textAlign": "center", "color": "#0ea5e9" },
        "productName": { "fontSize": 18, "fontWeight": "700", "textAlign": "center", "color": "#0f172a" },
        "productPrice": { "fontSize": 18, "fontWeight": "700", "textAlign": "center", "color": "#0ea5e9" },
        "productDescription": { "fontSize": 14, "fontWeight": "400", "textAlign": "center", "color": "#475569" }
      }
    }'::jsonb,
    null
  ),
  (
    'rustic-cards-v1',
    'rustic-cards',
    1,
    '{
      "id": "rustic-cards",
      "name": "Rustic House",
      "scope": "system",
      "sourceType": "preset",
      "isLocked": true,
      "menuTitle": "The Barn",
      "menuSubtitle": "Farm to Table",
      "fontFamily": "Montserrat",
      "primaryColor": "#78350f",
      "backgroundColor": "#fffbeb",
      "textColor": "#451a03",
      "layoutMode": "cards",
      "showImages": true,
      "columnCount": 2,
      "backgroundImage": "https://www.transparenttextures.com/patterns/wood-pattern.png",
      "customCategoryOrder": [],
      "customProductOrder": {},
      "hiddenProductIds": [],
      "floatingText": [],
      "pageBreaks": [],
      "elementStyles": {
        "category": { "fontSize": 24, "fontWeight": "700", "textAlign": "left", "color": "#78350f" },
        "productName": { "fontSize": 18, "fontWeight": "700", "textAlign": "left", "color": "#451a03" },
        "productPrice": { "fontSize": 18, "fontWeight": "700", "textAlign": "right", "color": "#92400e" },
        "productDescription": { "fontSize": 14, "fontWeight": "400", "textAlign": "left", "color": "#78350f" }
      }
    }'::jsonb,
    null
  )
on conflict (id) do update
set
  style_state = excluded.style_state,
  preview_asset_id = excluded.preview_asset_id;

update public.templates
set current_version_id = case id
  when 'modern-clean' then 'modern-clean-v1'
  when 'elegant-dark' then 'elegant-dark-v1'
  when 'casual-grid' then 'casual-grid-v1'
  when 'rustic-cards' then 'rustic-cards-v1'
  else current_version_id
end
where id in ('modern-clean', 'elegant-dark', 'casual-grid', 'rustic-cards');
