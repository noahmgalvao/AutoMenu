create table if not exists public.template_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null references public.templates(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, template_id)
);

create index if not exists template_favorites_template_idx on public.template_favorites(template_id);
alter table public.template_favorites enable row level security;
revoke all on public.template_favorites from public, anon, authenticated;
grant select, insert, delete on public.template_favorites to authenticated;

create policy template_favorites_select_own on public.template_favorites
for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.templates t where t.id = template_id
      and ((t.scope = 'system' and t.catalog_active)
        or (t.scope = 'workspace' and public.is_workspace_member(t.workspace_id)))
  )
);

create policy template_favorites_insert_accessible on public.template_favorites
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.templates t where t.id = template_id
      and ((t.scope = 'system' and t.catalog_active)
        or (t.scope = 'workspace' and public.is_workspace_member(t.workspace_id)))
  )
);

create policy template_favorites_delete_own on public.template_favorites
for delete to authenticated using (user_id = (select auth.uid()));
