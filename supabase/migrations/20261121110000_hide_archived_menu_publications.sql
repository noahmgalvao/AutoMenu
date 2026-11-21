-- Keep archived menus available to workspace members for undo while hiding their public links.
create or replace function public.is_active_menu_publication(p_menu_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.menus as menu
        join public.menu_publications as publication on publication.menu_id = menu.id
        where menu.id = p_menu_id and menu.status <> 'archived'
    );
$$;

revoke all on function public.is_active_menu_publication(text) from public;
grant execute on function public.is_active_menu_publication(text) to anon, authenticated;

drop policy if exists menu_publications_public_read on public.menu_publications;
create policy menu_publications_public_read on public.menu_publications
for select using (public.is_active_menu_publication(menu_id));

notify pgrst, 'reload schema';
