create or replace function public.ensure_my_workspace_menu(
  requested_workspace_id text,
  requested_menu_id text,
  initial_editor_state jsonb,
  initial_render_snapshot jsonb
)
returns public.menus
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_menu public.menus%rowtype;
  resolved_version_id text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = requested_workspace_id
      and wm.user_id = current_user_id
  ) then
    raise exception using errcode = '42501', message = 'Ambiente não pertence ao usuário autenticado.';
  end if;

  perform pg_advisory_xact_lock(hashtext(requested_workspace_id));

  if requested_menu_id is not null then
    select m.*
    into resolved_menu
    from public.menus m
    where m.id = requested_menu_id
      and m.workspace_id = requested_workspace_id
      and m.status <> 'archived'
    limit 1;
  end if;

  if resolved_menu.id is null then
    select m.*
    into resolved_menu
    from public.menus m
    where m.workspace_id = requested_workspace_id
      and m.status <> 'archived'
    order by m.created_at asc
    limit 1;
  end if;

  if resolved_menu.id is null then
    insert into public.menus (id, workspace_id, name, status)
    values (gen_random_uuid()::text, requested_workspace_id, 'Cardápio 1', 'draft')
    returning * into resolved_menu;
  end if;

  if resolved_menu.current_draft_version_id is null then
    select mv.id
    into resolved_version_id
    from public.menu_versions mv
    where mv.menu_id = resolved_menu.id
    order by mv.version_number desc
    limit 1;

    if resolved_version_id is null then
      resolved_version_id := gen_random_uuid()::text;

      insert into public.menu_versions (
        id,
        menu_id,
        version_number,
        version_type,
        editor_state,
        render_snapshot,
        created_by
      )
      values (
        resolved_version_id,
        resolved_menu.id,
        1,
        'snapshot',
        coalesce(initial_editor_state, '{}'::jsonb),
        coalesce(initial_render_snapshot, '{}'::jsonb),
        current_user_id
      );
    end if;

    update public.menus
    set current_draft_version_id = resolved_version_id
    where id = resolved_menu.id
    returning * into resolved_menu;
  end if;

  return resolved_menu;
end;
$$;

revoke all on function public.ensure_my_workspace_menu(text, text, jsonb, jsonb) from public;
grant execute on function public.ensure_my_workspace_menu(text, text, jsonb, jsonb) to authenticated;
