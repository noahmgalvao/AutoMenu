create table if not exists public.custom_menu_markers (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  shape jsonb not null check (jsonb_typeof(shape) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.custom_menu_markers enable row level security;
revoke all on public.custom_menu_markers from public, anon, authenticated;
grant select, insert, delete on public.custom_menu_markers to authenticated;

create policy custom_menu_markers_select_own on public.custom_menu_markers
  for select to authenticated using (user_id = (select auth.uid()));
create policy custom_menu_markers_insert_own on public.custom_menu_markers
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy custom_menu_markers_delete_own on public.custom_menu_markers
  for delete to authenticated using (user_id = (select auth.uid()));
