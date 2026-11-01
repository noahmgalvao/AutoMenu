create table if not exists public.menu_product_sync_links (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  source_menu_id text not null references public.menus(id) on delete cascade,
  target_menu_id text not null references public.menus(id) on delete cascade,
  product_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (source_menu_id, target_menu_id, product_id),
  constraint menu_product_sync_links_distinct_menus check (source_menu_id <> target_menu_id)
);

create index if not exists idx_menu_product_sync_links_source
  on public.menu_product_sync_links(workspace_id, source_menu_id);

create index if not exists idx_menu_product_sync_links_target
  on public.menu_product_sync_links(workspace_id, target_menu_id);

alter table public.menu_product_sync_links enable row level security;

drop policy if exists menu_product_sync_links_member on public.menu_product_sync_links;
create policy menu_product_sync_links_member on public.menu_product_sync_links
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

insert into public.menu_product_sync_links (
  workspace_id,
  source_menu_id,
  target_menu_id,
  product_id
)
select
  source_link.workspace_id,
  source_link.menu_id,
  target_link.menu_id,
  source_link.product_id
from public.menu_synced_products source_link
join public.menu_synced_products target_link
  on target_link.workspace_id = source_link.workspace_id
 and target_link.product_id = source_link.product_id
 and target_link.menu_id <> source_link.menu_id
on conflict do nothing;
