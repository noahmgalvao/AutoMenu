alter table public.menu_versions
  add column if not exists action_label text;

create table if not exists public.menu_publications (
  id text primary key default gen_random_uuid()::text,
  menu_id text not null unique references public.menus(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  restaurant_slug text not null,
  menu_slug text not null,
  published_version_id text not null references public.menu_versions(id) on delete cascade,
  pdf_asset_id text references public.assets(id) on delete set null,
  pdf_bucket text not null default 'menu-assets',
  pdf_path text,
  pdf_filename text not null default 'cardapio.pdf',
  pdf_options jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  asset_ids text[] not null default '{}'::text[],
  content_signature text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint menu_publications_public_url_key unique (restaurant_slug, menu_slug)
);

create table if not exists public.menu_synced_products (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  menu_id text not null references public.menus(id) on delete cascade,
  product_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (menu_id, product_id)
);

create index if not exists idx_menu_publications_workspace_id on public.menu_publications(workspace_id);
create index if not exists idx_menu_publications_public_url on public.menu_publications(restaurant_slug, menu_slug);
create index if not exists idx_menu_synced_products_lookup on public.menu_synced_products(workspace_id, product_id);

drop trigger if exists set_menu_publications_updated_at on public.menu_publications;
create trigger set_menu_publications_updated_at
before update on public.menu_publications
for each row execute function public.set_updated_at();

alter table public.menu_publications enable row level security;
alter table public.menu_synced_products enable row level security;

drop policy if exists menu_publications_public_read on public.menu_publications;
create policy menu_publications_public_read on public.menu_publications
for select using (true);

drop policy if exists menu_publications_insert_member on public.menu_publications;
create policy menu_publications_insert_member on public.menu_publications
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists menu_publications_update_member on public.menu_publications;
create policy menu_publications_update_member on public.menu_publications
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists menu_publications_delete_member on public.menu_publications;
create policy menu_publications_delete_member on public.menu_publications
for delete using (public.is_workspace_member(workspace_id));

drop policy if exists menu_synced_products_member on public.menu_synced_products;
create policy menu_synced_products_member on public.menu_synced_products
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists assets_select_published on public.assets;
create policy assets_select_published on public.assets
for select using (
  exists (
    select 1 from public.menu_publications publication
    where assets.id = any(publication.asset_ids)
       or assets.id = publication.pdf_asset_id
  )
);

drop policy if exists storage_read_published_menu_files on storage.objects;
create policy storage_read_published_menu_files on storage.objects
for select using (
  exists (
    select 1
    from public.menu_publications publication
    where publication.pdf_bucket = bucket_id
      and publication.pdf_path = name
  )
  or
  exists (
    select 1
    from public.assets asset
    join public.menu_publications publication
      on (asset.id = any(publication.asset_ids)
      or asset.id = publication.pdf_asset_id)
    where asset.bucket = bucket_id
      and asset.path = name
  )
);
