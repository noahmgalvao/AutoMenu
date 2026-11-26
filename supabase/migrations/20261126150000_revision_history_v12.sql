-- v1.2: additive and opt-in. No legacy rows or objects are removed.
alter table public.menus add column if not exists revision_write_version bigint not null default 0;
alter table public.menus add column if not exists revision_last_operation text;
create table if not exists public.revision_config(
 id boolean primary key default true check(id),enabled boolean not null default false,
 max_automatic int not null default 1000 check(max_automatic>0),recent_reserve int not null default 100,milestone_reserve int not null default 150,max_protected int not null default 100,
 provider_id text not null default 'supabase-v1',metrics jsonb not null default '{}',capacity_level int not null default 0,recovery_ratio numeric not null default .8,
 checkpoint_pause_reason text,grace_seconds int not null default 86400,asset_inventory_complete boolean not null default false,updated_at timestamptz not null default now());
insert into public.revision_config(id) values(true) on conflict do nothing;
create table if not exists public.revision_menu_state(
 menu_id text primary key references public.menus(id) on delete cascade,next_sequence bigint not null default 1,manual_counter bigint not null default 0,timezone text not null default 'UTC',
 last_revision_id text,durable_hash text,pending_first timestamptz,pending_last timestamptz,pending_generation bigint not null default 0,
 migrated boolean not null default false,legacy_cursor bigint not null default 0,compacted bigint not null default 0,retention_limit int not null default 1000,paused_reason text,updated_at timestamptz not null default now());
create table if not exists public.revision_blobs(
 id text primary key,namespace text not null references public.workspaces(id) on delete cascade,provider_id text not null,bucket text not null,object_key text not null,
 byte_length bigint not null check(byte_length>=0),checksum text not null check(length(checksum)=64),generation bigint not null default 1,
 status text not null default 'pending' check(status in('pending','ready','deleting')),lease_until timestamptz not null default now()+interval '10 minutes',created_at timestamptz not null default now(),unique(namespace,provider_id,object_key));
create table if not exists public.revision_blob_locations(
 blob_id text not null references public.revision_blobs(id),provider_id text not null,bucket text not null,object_key text not null,byte_length bigint not null,checksum text not null,generation bigint not null,verified_at timestamptz not null,
 primary key(blob_id,provider_id,object_key));
create table if not exists public.revision_states(
 id text primary key,namespace text not null references public.workspaces(id) on delete cascade,state_hash text not null check(length(state_hash)=64),schema_version int not null,
 representation text not null check(representation in('snapshot','delta')),base_state_id text references public.revision_states(id),chain_depth int not null check(chain_depth between 0 and 49),
 codec text not null check(codec in('gzip-v1','raw-v1')),patch_version int not null default 1,byte_length bigint not null,raw_length bigint not null,payload_hash text not null,
 blob_id text not null references public.revision_blobs(id),chain_bytes bigint not null,generation bigint not null default 1,created_at timestamptz not null default now(),unique(namespace,state_hash,schema_version),
 check((representation='snapshot' and base_state_id is null and chain_depth=0) or (representation='delta' and base_state_id is not null and chain_depth>0)));
create index if not exists revision_states_base on public.revision_states(base_state_id) where base_state_id is not null;
create index if not exists revision_states_blob on public.revision_states(blob_id);
create table if not exists public.menu_revisions(
 id text primary key,menu_id text not null references public.menus(id) on delete cascade,sequence bigint not null,created_at timestamptz not null default now(),actor_id uuid references auth.users(id) on delete set null,
 kind text not null,priority int not null default 0 check(priority between 0 and 3),event_tags text[] not null default '{}',name text check(length(name)<=100),protection text check(protection in('original','user')),
 state_hash text not null,state_id text not null references public.revision_states(id),schema_version int not null,source_revision_id text,idempotency_key text not null,legacy_version_id text,
 unique(menu_id,sequence),unique(menu_id,idempotency_key));
create unique index if not exists menu_revisions_legacy on public.menu_revisions(legacy_version_id) where legacy_version_id is not null;
create unique index if not exists menu_revisions_original on public.menu_revisions(menu_id) where protection='original';
create index if not exists menu_revisions_protected on public.menu_revisions(menu_id,sequence desc) where protection is not null;
create index if not exists menu_revisions_important on public.menu_revisions(menu_id,sequence desc) where priority>=2;
create index if not exists menu_revisions_state on public.menu_revisions(state_id);
create table if not exists public.revision_asset_refs(ref_type text not null,ref_id text not null,asset_id text not null references public.assets(id) on delete no action deferrable initially deferred,primary key(ref_type,ref_id,asset_id));
create index if not exists revision_asset_refs_asset on public.revision_asset_refs(asset_id);
create table if not exists public.revision_leases(id text primary key,menu_id text references public.menus(id) on delete cascade,state_id text references public.revision_states(id),blob_ids text[] not null default '{}',revision_ids text[] not null default '{}',expires_at timestamptz not null default now()+interval '10 minutes');
create table if not exists public.revision_jobs(menu_id text primary key references public.menus(id) on delete cascade,due_at timestamptz not null,lease_token text,lease_until timestamptz,attempts int not null default 0,last_error text);
create index if not exists revision_jobs_due on public.revision_jobs(due_at);
create table if not exists public.revision_reservations(operation_id text primary key,namespace text not null,bytes bigint not null check(bytes>=0),resource text not null default 'storage',expires_at timestamptz not null default now()+interval '10 minutes');
create table if not exists public.revision_operations(menu_id text not null references public.menus(id) on delete cascade,operation_id text not null,result jsonb not null,expires_at timestamptz not null default now()+interval '30 days',primary key(menu_id,operation_id));
do $$ declare t text; begin
 foreach t in array array['revision_config','revision_menu_state','revision_blobs','revision_blob_locations','revision_states','menu_revisions','revision_asset_refs','revision_leases','revision_jobs','revision_reservations','revision_operations'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;
end $$;
grant select on public.menu_revisions,public.revision_menu_state to authenticated;
drop policy if exists revision_read on public.menu_revisions;
create policy revision_read on public.menu_revisions for select to authenticated using(exists(select 1 from public.menus m where m.id=menu_id and public.is_workspace_member(m.workspace_id)));
drop policy if exists revision_runtime_read on public.revision_menu_state;
create policy revision_runtime_read on public.revision_menu_state for select to authenticated using(exists(select 1 from public.menus m where m.id=menu_id and public.is_workspace_member(m.workspace_id)));
create or replace function public.revision_assert_actor(p_menu text,p_actor uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare w text;begin select workspace_id into w from public.menus where id=p_menu;
 if w is null or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=p_actor) then raise exception 'Acesso negado' using errcode='42501';end if;return w;end $$;
create or replace function public.revision_reserve(p_operation text,p_namespace text,p_bytes bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.revision_config;in_flight numeric;u numeric;q numeric;k text;pending_count int;begin
 select * into c from public.revision_config where id for update;
 if not c.enabled or c.capacity_level>=95 or c.checkpoint_pause_reason is not null then raise exception '%',coalesce(c.checkpoint_pause_reason,'Histórico pausado por capacidade ou configuração');end if;
 if p_bytes<0 or p_bytes>16777216 then raise exception 'Limite de bytes excedido';end if;
 select coalesce(sum(bytes),0) into in_flight from public.revision_reservations where expires_at>now() and operation_id<>p_operation;
 u:=(c.metrics->'storage'->>'used')::numeric;q:=(c.metrics->'storage'->>'limit')::numeric;
 if q is not null and u is not null and u+in_flight+p_bytes>q*.95 then raise exception 'Reserva recusada por capacidade de Storage';end if;
 select count(*) into pending_count from public.revision_reservations where expires_at>now() and operation_id<>p_operation;
 foreach k in array array['database','disk'] loop
 u:=(c.metrics->k->>'used')::numeric;q:=(c.metrics->k->>'limit')::numeric;
 if q is not null and u is not null and u+(pending_count+1)*8192>q*.95 then raise exception 'Reserva recusada por capacidade de %',k;end if;end loop;
 insert into public.revision_reservations(operation_id,namespace,bytes) values(p_operation,p_namespace,p_bytes) on conflict(operation_id) do update set expires_at=now()+interval '10 minutes' where revision_reservations.namespace=excluded.namespace and revision_reservations.bytes=excluded.bytes;
 if not exists(select 1 from public.revision_reservations where operation_id=p_operation and namespace=p_namespace and bytes=p_bytes) then raise exception 'Reserva idempotente divergente';end if;
end $$;

-- Optional catalog integration: older projects do not yet have the catalog background table.
create or replace function public.revision_asset_authorized(p_namespace text,p_asset text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare shared boolean:=false;begin
 if exists(select 1 from public.assets where id=p_asset and workspace_id=p_namespace and coalesce(metadata->>'history_gc_status','ready')<>'deleting') then return true;end if;
 if to_regclass('public.catalog_template_backgrounds') is not null then execute 'select exists(select 1 from public.catalog_template_backgrounds where asset_id=$1)' into shared using p_asset;end if;
 return coalesce(shared,false);end $$;
revoke all on function public.revision_asset_authorized(text,text) from public,anon,authenticated;
grant execute on function public.revision_asset_authorized(text,text) to service_role;
-- Backend validates all content and authorization before invoking the transaction.
create or replace function public.revision_commit(p_menu text,p_actor uuid,p_expected bigint,p_operation text,p_state jsonb,p_blob jsonb,p_options jsonb,p_assets text[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w text;m public.menus;r public.revision_menu_state;c public.revision_config;v public.menu_revisions;previous public.menu_revisions;sid text;bid text;seq bigint;manual boolean;pv text;nm text;saved jsonb;begin
 w:=public.revision_assert_actor(p_menu,p_actor);select * into m from public.menus where id=p_menu for update;
 select result into saved from public.revision_operations where menu_id=p_menu and operation_id=p_operation;if saved is not null then select * into v from public.menu_revisions where id=saved->>'revisionId' and menu_id=p_menu;if not found then raise exception 'Operação já concluída; revisão não está mais disponível';end if;return to_jsonb(v);end if;
 select * into v from public.menu_revisions where menu_id=p_menu and idempotency_key=p_operation;if found then return to_jsonb(v);end if;
 if m.revision_write_version<>p_expected then raise exception 'Conflito: cardápio alterado em outro dispositivo' using errcode='40001';end if;
 select * into c from public.revision_config where id;
 if not c.enabled or c.capacity_level>=95 or c.checkpoint_pause_reason is not null then raise exception '%',coalesce(c.checkpoint_pause_reason,'Histórico indisponível por capacidade ou configuração');end if;
 insert into public.revision_menu_state(menu_id,retention_limit) values(p_menu,c.max_automatic) on conflict do nothing;
 select * into r from public.revision_menu_state where menu_id=p_menu for update;
 manual:=coalesce((p_options->>'manual')::boolean,false);nm:=nullif(trim(p_options->>'name'),'');
 if manual and exists(select 1 from public.menu_revisions where menu_id=p_menu and state_hash=p_state->>'state_hash' and protection is not null) then raise exception 'O estado atual já está protegido';end if;
 if manual and(nm is null or length(nm)>100) then raise exception 'Informe nome de até 100 caracteres';end if;
 select * into previous from public.menu_revisions where id=r.last_revision_id;
 if p_options->>'kind'='published' then select * into previous from public.menu_revisions where menu_id=p_menu and state_hash=p_state->>'state_hash' order by sequence desc limit 1;end if;
 if previous.state_hash=p_state->>'state_hash' and not coalesce((p_options->>'forceLogical')::boolean,false) then
 v:=previous;
 if manual then
 if v.protection is not null then raise exception 'O estado atual já está protegido';end if;
 if(select count(*) from public.menu_revisions where menu_id=p_menu and protection='user')>=c.max_protected then raise exception 'Limite de versões protegidas atingido';end if;
 if coalesce((p_options->>'defaultName')::boolean,false) then nm:='Versão '||(r.manual_counter+1);end if;
 update public.menu_revisions set protection='user',name=nm where id=v.id returning * into v;
 update public.revision_menu_state set manual_counter=manual_counter+1 where menu_id=p_menu;end if;
 update public.menu_revisions set priority=greatest(priority,coalesce((p_options->>'priority')::int,0)),event_tags=array(select distinct unnest(event_tags||coalesce(array(select jsonb_array_elements_text(p_options->'tags')),'{}'::text[]))) where id=v.id returning * into v;
 else
 pv:=case when p_options->>'original'='true' then 'original' when manual then 'user' else null end;
 if pv='user' and(select count(*) from public.menu_revisions where menu_id=p_menu and protection='user')>=c.max_protected then raise exception 'Limite de versões protegidas atingido';end if;
 if manual and coalesce((p_options->>'defaultName')::boolean,false) then nm:='Versão '||(r.manual_counter+1);end if;
 select id into sid from public.revision_states where namespace=w and state_hash=p_state->>'state_hash' and schema_version=(p_state->>'schema_version')::int;
 if sid is null then
 bid:=p_blob->>'id';perform 1 from public.revision_blobs where id=bid for update;
 if not exists(select 1 from public.revision_blobs where id=bid and namespace=w and status in('pending','ready') and checksum=p_blob->>'checksum' and lease_until>now()) then raise exception 'Upload não reservado ou inválido';end if;
 if p_state->>'base_state_id' is not null and not exists(select 1 from public.revision_states b where b.id=p_state->>'base_state_id' and b.namespace=w and b.chain_depth+1=(p_state->>'chain_depth')::int) then raise exception 'Base inválida';end if;
 update public.revision_blobs set status='ready' where id=bid;
 insert into public.revision_states(id,namespace,state_hash,schema_version,representation,base_state_id,chain_depth,codec,patch_version,byte_length,raw_length,payload_hash,blob_id,chain_bytes)
 values(p_state->>'id',w,p_state->>'state_hash',(p_state->>'schema_version')::int,p_state->>'representation',p_state->>'base_state_id',(p_state->>'chain_depth')::int,p_state->>'codec',1,(p_state->>'byte_length')::bigint,(p_state->>'raw_length')::bigint,p_state->>'payload_hash',bid,(p_state->>'chain_bytes')::bigint) on conflict(namespace,state_hash,schema_version) do nothing;
 select id into sid from public.revision_states where namespace=w and state_hash=p_state->>'state_hash' and schema_version=(p_state->>'schema_version')::int;end if;
 if pv is not null and exists(select 1 from public.revision_states where id=sid and representation<>'snapshot') then raise exception 'Versão protegida exige materialização';end if;
 if exists(select 1 from unnest(p_assets) a where not public.revision_asset_authorized(w,a)) then raise exception 'Recurso não autorizado';end if;
 seq:=r.next_sequence;
 insert into public.menu_revisions(id,menu_id,sequence,created_at,actor_id,kind,priority,event_tags,name,protection,state_hash,state_id,schema_version,source_revision_id,idempotency_key,legacy_version_id)
 values(gen_random_uuid()::text,p_menu,seq,coalesce((p_options->>'createdAt')::timestamptz,now()),case when p_options->>'legacyVersionId' is not null then (p_options->>'actorId')::uuid else p_actor end,coalesce(p_options->>'kind','checkpoint'),coalesce((p_options->>'priority')::int,0),coalesce(array(select jsonb_array_elements_text(p_options->'tags')),'{}'),nm,pv,p_state->>'state_hash',sid,1,p_options->>'sourceRevisionId',p_operation,p_options->>'legacyVersionId') returning * into v;
 insert into public.revision_asset_refs(ref_type,ref_id,asset_id) select 'state',sid,a from unnest(p_assets) a on conflict do nothing;
 update public.revision_menu_state set next_sequence=seq+1,manual_counter=manual_counter+case when manual then 1 else 0 end where menu_id=p_menu;end if;
 if coalesce(p_options->>'advance','true')<>'false' then
 update public.revision_menu_state set last_revision_id=v.id,pending_first=null,pending_last=null,paused_reason=null,updated_at=now() where menu_id=p_menu;
 if p_options->>'legacyVersionId' is null then delete from public.revision_jobs where menu_id=p_menu;end if;end if;
 delete from public.revision_reservations where operation_id=p_operation;
 insert into public.revision_operations(menu_id,operation_id,result) values(p_menu,p_operation,jsonb_build_object('revisionId',v.id)) on conflict do nothing;
 if p_options->>'kind'='published' then insert into public.revision_leases(id,menu_id,revision_ids) values('pub:'||p_operation,p_menu,array[v.id]) on conflict(id) do nothing;end if;
 return to_jsonb(v);
end $$;
create or replace function public.revision_save_draft(p_menu text,p_actor uuid,p_expected bigint,p_operation text,p_editor jsonb,p_snapshot jsonb,p_hash text,p_catalog jsonb default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.menus;r public.revision_menu_state;v public.menu_versions;begin
 perform public.revision_assert_actor(p_menu,p_actor);select * into m from public.menus where id=p_menu for update;
 if m.revision_last_operation=p_operation then select * into v from public.menu_versions where id=m.current_draft_version_id;return jsonb_build_object('menu',to_jsonb(m),'version',to_jsonb(v));end if;
 if m.revision_write_version<>p_expected then raise exception 'Conflito: alterações em outro dispositivo. Estado local preservado.' using errcode='40001';end if;
 select * into r from public.revision_menu_state where menu_id=p_menu for update;if not found or not r.migrated then raise exception 'Migração do histórico pendente';end if;
 if octet_length(p_snapshot::text)>8388608 or length(p_hash)<>64 then raise exception 'Documento excede limite';end if;
 if m.current_draft_version_id=m.published_version_id or exists(select 1 from public.menu_publications where published_version_id=m.current_draft_version_id) then
 insert into public.menu_versions(id,menu_id,version_number,version_type,editor_state,render_snapshot,created_by)
 select gen_random_uuid()::text,p_menu,coalesce(max(version_number),0)+1,'draft',p_editor,p_snapshot,p_actor from public.menu_versions where menu_id=p_menu returning * into v;
 else update public.menu_versions set editor_state=p_editor,render_snapshot=p_snapshot,created_by=p_actor,created_at=now() where id=m.current_draft_version_id returning * into v;end if;
 if v.id is null then raise exception 'Estado atual indisponível';end if;
 if p_catalog is not null then
 if exists(select 1 from jsonb_array_elements(p_catalog->'categories') c where c->>'workspace_id'<>m.workspace_id)
 or exists(select 1 from jsonb_array_elements(p_catalog->'products') p where p->>'workspace_id'<>m.workspace_id) then raise exception 'Catálogo não autorizado';end if;
 insert into public.catalog_categories(id,workspace_id,name,slug,position,is_active)
 select id,workspace_id,name,slug,position,is_active from jsonb_to_recordset(p_catalog->'categories') as c(id text,workspace_id text,name text,slug text,position int,is_active boolean)
 on conflict(id) do update set name=excluded.name,slug=excluded.slug,position=excluded.position,is_active=excluded.is_active where catalog_categories.workspace_id=m.workspace_id;
 insert into public.catalog_products(id,workspace_id,category_id,name,description,base_price,primary_asset_id,sort_index,is_active)
 select id,workspace_id,category_id,name,description,base_price,primary_asset_id,sort_index,is_active from jsonb_to_recordset(p_catalog->'products') as p(id text,workspace_id text,category_id text,name text,description text,base_price numeric,primary_asset_id text,sort_index int,is_active boolean)
 on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,base_price=excluded.base_price,primary_asset_id=excluded.primary_asset_id,sort_index=excluded.sort_index,is_active=excluded.is_active where catalog_products.workspace_id=m.workspace_id;
 end if;

 update public.menus set current_draft_version_id=v.id,revision_write_version=revision_write_version+1,revision_last_operation=p_operation where id=p_menu returning * into m;
 update public.revision_menu_state set durable_hash=p_hash,
 pending_first=case when p_hash=(select state_hash from public.menu_revisions where id=r.last_revision_id) then null else coalesce(pending_first,now()) end,
 pending_last=case when p_hash=(select state_hash from public.menu_revisions where id=r.last_revision_id) then null else now() end,pending_generation=pending_generation+1,updated_at=now() where menu_id=p_menu returning * into r;
 if r.pending_first is null then delete from public.revision_jobs where menu_id=p_menu;
 else insert into public.revision_jobs(menu_id,due_at) values(p_menu,least(r.pending_first+interval '5 minutes',r.pending_last+interval '90 seconds')) on conflict(menu_id) do update set due_at=excluded.due_at;end if;
 return jsonb_build_object('menu',to_jsonb(m),'version',to_jsonb(v));end $$;
create or replace function public.revision_protect(p_menu text,p_actor uuid,p_revision text,p_name text,p_protect boolean,p_confirmed boolean,p_operation text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.menu_revisions;c public.revision_config;saved jsonb;begin
 perform public.revision_assert_actor(p_menu,p_actor);perform 1 from public.menus where id=p_menu for update;
 select result into saved from public.revision_operations where menu_id=p_menu and operation_id=p_operation;if saved is not null then select * into v from public.menu_revisions where id=saved->>'revisionId' and menu_id=p_menu;if not found then raise exception 'Operação já concluída; revisão não está mais disponível';end if;return to_jsonb(v);end if;
 select * into v from public.menu_revisions where id=p_revision and menu_id=p_menu for update;if not found then raise exception 'Revisão indisponível';end if;
 select * into c from public.revision_config where id;
 if v.protection='original' and not p_protect then raise exception 'Original não pode ser desprotegida';end if;
 if p_name is not null and(length(trim(p_name))=0 or length(trim(p_name))>100) then raise exception 'Nome inválido';end if;
 if p_protect and v.protection is null and(select count(*) from public.menu_revisions where menu_id=p_menu and protection='user')>=c.max_protected then raise exception 'Limite de versões protegidas atingido';end if;
 if p_protect and exists(select 1 from public.revision_states where id=v.state_id and representation<>'snapshot') then raise exception 'Materialização necessária';end if;
 if not p_protect and not p_confirmed then raise exception 'Confirme a remoção da proteção';end if;
 update public.menu_revisions set protection=case when v.protection='original' then 'original' when p_protect then 'user' else null end,name=case when p_protect then coalesce(trim(p_name),name) else null end where id=v.id returning * into v;
 insert into public.revision_operations(menu_id,operation_id,result) values(p_menu,p_operation,jsonb_build_object('revisionId',v.id));return to_jsonb(v);end $$;
create or replace function public.revision_compact(p_menu text,p_actor uuid,p_expected_sequence bigint,p_keep text[],p_pins text[]) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.revision_menu_state;c public.revision_config;n int;removed int;pins text[];begin
 perform public.revision_assert_actor(p_menu,p_actor);perform 1 from public.menus where id=p_menu for update;
 select * into r from public.revision_menu_state where menu_id=p_menu for update;select * into c from public.revision_config where id;
 if r.next_sequence<>p_expected_sequence then raise exception 'Conflito na compactação' using errcode='40001';end if;
 if c.max_automatic<>r.retention_limit then raise exception 'Mudança de retenção exige migração deliberada';end if;
 select count(*) into n from public.menu_revisions where menu_id=p_menu and protection is null;if n<=r.retention_limit then return 0;end if;
 select array_agg(distinct a.id) into pins from(select unnest(coalesce(p_pins,'{}')) id union select unnest(revision_ids) from public.revision_leases where menu_id=p_menu and expires_at>now()) a join public.menu_revisions pinned on pinned.id=a.id and pinned.menu_id=p_menu and pinned.protection is null;
 if cardinality(coalesce(pins,'{}'))>r.retention_limit then return 0;end if;
 if exists(select 1 from public.menu_revisions where menu_id=p_menu and protection is null and id=any(coalesce(pins,'{}')) and not(id=any(p_keep))) then raise exception 'Reserva temporária ausente';end if;
 if(select count(*) from public.menu_revisions where menu_id=p_menu and protection is null and id=any(p_keep))<>r.retention_limit then raise exception 'Plano de retenção incompleto';end if;
 delete from public.menu_revisions where menu_id=p_menu and protection is null and not(id=any(p_keep));get diagnostics removed=row_count;
 update public.revision_menu_state set compacted=compacted+removed where menu_id=p_menu;return removed;end $$;
create or replace function public.revision_claim_jobs(p_token text,p_limit int default 10) returns setof public.revision_jobs language sql security definer set search_path=public,pg_temp as $$
 update public.revision_jobs j set lease_token=p_token,lease_until=now()+interval '2 minutes',attempts=attempts+1 where menu_id in(select menu_id from public.revision_jobs where due_at<=now() and(lease_until is null or lease_until<now()) order by due_at limit least(20,greatest(1,p_limit)) for update skip locked) returning j.* $$;
create or replace function public.revision_guard_legacy() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if current_user in('authenticated','anon') and exists(select 1 from public.revision_menu_state r where r.menu_id=new.menu_id and r.migrated) then raise exception 'Atualize o AutoMenu antes de salvar este cardápio';end if;return new;end $$;
drop trigger if exists revision_legacy_write_guard on public.menu_versions;
create trigger revision_legacy_write_guard before insert or update on public.menu_versions for each row execute function public.revision_guard_legacy();
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('revision_assert_actor','revision_reserve','revision_commit','revision_save_draft','revision_protect','revision_compact','revision_claim_jobs') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('revision-blobs','revision-blobs',false,16777216,array['application/octet-stream']) on conflict(id) do nothing;
-- No client Storage policy. Bytes are accessible only after backend authorization.
-- Atomic pointer replacement after backend reconstructs and verifies a snapshot of the same hash.
create or replace function public.revision_rebase(p_state text,p_generation bigint,p_blob text,p_metadata jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.revision_states;b public.revision_blobs;begin
 select * into s from public.revision_states where id=p_state for update;
 if not found or s.generation<>p_generation then return false;end if;
 select * into b from public.revision_blobs where id=p_blob for update;
 if b.namespace<>s.namespace or b.status='deleting' or b.lease_until<now() or p_metadata->>'state_hash'<>s.state_hash then raise exception 'Rebase inválido';end if;
 update public.revision_blobs set status='ready' where id=b.id;
 update public.revision_states set representation='snapshot',base_state_id=null,chain_depth=0,chain_bytes=b.byte_length,codec=p_metadata->>'codec',byte_length=b.byte_length,raw_length=(p_metadata->>'raw_length')::bigint,payload_hash=b.checksum,blob_id=b.id,generation=generation+1 where id=s.id;
 return true;end $$;
create or replace function public.revision_restore(p_menu text,p_actor uuid,p_expected bigint,p_operation text,p_source text,p_pre jsonb,p_post jsonb,p_editor jsonb,p_snapshot jsonb,p_assets text[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.menu_revisions;pre jsonb;post jsonb;saved jsonb;begin
 perform public.revision_assert_actor(p_menu,p_actor);perform 1 from public.menus where id=p_menu for update;
 select result into saved from public.revision_operations where menu_id=p_menu and operation_id=p_operation;if saved is not null then return saved;end if;
 select * into source from public.menu_revisions where id=p_source and menu_id=p_menu for share;if not found then raise exception 'Origem indisponível';end if;
 if source.state_hash=p_pre->'state'->>'state_hash' then return jsonb_build_object('noop',true);end if;
 pre:=public.revision_commit(p_menu,p_actor,p_expected,p_operation||':pre',p_pre->'state',p_pre->'blob','{"kind":"pre-restore","priority":3,"tags":["restauração:antes"]}',array(select jsonb_array_elements_text(p_pre->'assets')));
 perform public.revision_save_draft(p_menu,p_actor,p_expected,p_operation||':draft',p_editor,p_snapshot,source.state_hash);
 post:=public.revision_commit(p_menu,p_actor,p_expected+1,p_operation||':post',p_post->'state',p_post->'blob',jsonb_build_object('kind','restore','priority',3,'tags',jsonb_build_array('restauração'),'forceLogical',true,'sourceRevisionId',source.id),p_assets);
 insert into public.revision_leases(id,menu_id,revision_ids) values(p_operation,p_menu,array[source.id,pre->>'id',post->>'id']) on conflict(id) do nothing;
 saved:=jsonb_build_object('pre',pre->>'id','post',post->>'id','source',source.id);
 insert into public.revision_operations(menu_id,operation_id,result) values(p_menu,p_operation,saved);return saved;end $$;
create or replace function public.revision_copy(p_menu text,p_actor uuid,p_revision text,p_operation text,p_editor jsonb,p_snapshot jsonb,p_prepared jsonb,p_assets text[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w text;mid text:=gen_random_uuid()::text;vid text:=gen_random_uuid()::text;src public.menu_revisions;saved jsonb;begin
 w:=public.revision_assert_actor(p_menu,p_actor);perform 1 from public.menus where id=p_menu for update;
 select result into saved from public.revision_operations where menu_id=p_menu and operation_id=p_operation;if saved is not null then return saved;end if;
 select * into src from public.menu_revisions where id=p_revision and menu_id=p_menu for share;if not found then raise exception 'Origem indisponível';end if;
 insert into public.menus(id,workspace_id,name,status) select mid,w,name||' — cópia','draft' from public.menus where id=p_menu;
 insert into public.menu_versions(id,menu_id,version_number,version_type,editor_state,render_snapshot,created_by) values(vid,mid,1,'draft',p_editor,p_snapshot,p_actor);
 update public.menus set current_draft_version_id=vid where id=mid;
 insert into public.revision_menu_state(menu_id,migrated,retention_limit) select mid,true,max_automatic from public.revision_config where id;
 perform public.revision_commit(mid,p_actor,0,p_operation||':original',p_prepared->'state',p_prepared->'blob','{"original":true,"kind":"original","name":"Original da cópia"}',p_assets);
 saved:=jsonb_build_object('menuId',mid);insert into public.revision_operations(menu_id,operation_id,result) values(p_menu,p_operation,saved);return saved;end $$;
-- Remove unreachable states in bounded batches. FKs + leases + locks preserve the dependency closure.
create or replace function public.revision_gc(p_limit int default 10) returns setof public.revision_blobs language plpgsql security definer set search_path=public,pg_temp as $$
declare ids text[];c public.revision_config;begin
 select * into c from public.revision_config where id;
 if exists(select 1 from public.revision_leases where id like 'backup:%' and expires_at>now()) then return;end if;
 perform public.revision_housekeeping();
 with recursive reachable(id) as(
 select state_id from public.menu_revisions union select state_id from public.revision_leases where expires_at>now() and state_id is not null
 union select s.base_state_id from public.revision_states s join reachable r on r.id=s.id where s.base_state_id is not null)
 select array_agg(id) into ids from(select s.id from public.revision_states s where s.created_at<now()-make_interval(secs=>c.grace_seconds)
 and not exists(select 1 from reachable r where r.id=s.id) and not exists(select 1 from public.revision_states d where d.base_state_id=s.id) order by s.created_at limit least(20,greatest(1,p_limit)) for update skip locked) a;
 delete from public.revision_asset_refs where ref_type='state' and ref_id=any(coalesce(ids,'{}'));
 delete from public.revision_states where id=any(coalesce(ids,'{}'));
 return query update public.revision_blobs b set status='deleting',generation=generation+1 where b.id in(
 select x.id from public.revision_blobs x where x.lease_until<now() and x.created_at<now()-make_interval(secs=>c.grace_seconds)
 and not exists(select 1 from public.revision_states s where s.blob_id=x.id) and not exists(select 1 from public.revision_blob_locations l where l.blob_id=x.id) and not exists(select 1 from public.revision_leases l where l.expires_at>now() and x.id=any(l.blob_ids))
 order by x.created_at limit least(20,greatest(1,p_limit)) for update skip locked) returning b.*;
end $$;
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('revision_rebase','revision_restore','revision_copy','revision_gc') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
create or replace function public.revision_read_chain(p_state text,p_namespace text,p_lease text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 perform 1 from public.revision_states where id=p_state and namespace=p_namespace for share;if not found then raise exception 'Estado indisponível';end if;
 insert into public.revision_leases(id,state_id) values(p_lease,p_state) on conflict(id) do update set expires_at=now()+interval '10 minutes';
 with recursive chain as(select s.*,array[s.id] path from public.revision_states s where s.id=p_state and s.namespace=p_namespace
 union all select s.*,c.path||s.id from public.revision_states s join chain c on s.id=c.base_state_id where s.namespace=p_namespace and not s.id=any(c.path) and cardinality(c.path)<=50)
 select jsonb_agg(jsonb_build_object('state',to_jsonb(c)-'path','blob',to_jsonb(b),'locations',(select jsonb_agg(to_jsonb(l)) from public.revision_blob_locations l where l.blob_id=b.id))) into result from chain c join public.revision_blobs b on b.id=c.blob_id where b.status='ready';
 perform 1 from public.revision_blobs where id in(select x->'blob'->>'id' from jsonb_array_elements(result) x) order by id for update;
 if exists(select 1 from public.revision_blobs where id in(select x->'blob'->>'id' from jsonb_array_elements(result) x) and status<>'ready') then raise exception 'Blob em coleta; tente novamente';end if;
 update public.revision_blobs set lease_until=greatest(lease_until,now()+interval '10 minutes') where id in(select x->'blob'->>'id' from jsonb_array_elements(result) x);
 update public.revision_leases set blob_ids=array(select x->'blob'->>'id' from jsonb_array_elements(result) x) where id=p_lease;
 return result;end $$;
revoke all on function public.revision_read_chain(text,text,text) from public,anon,authenticated;
grant execute on function public.revision_read_chain(text,text,text) to service_role;
-- Read-only measurements. They are not disk/WAL/billing or organization quota metrics.
create or replace function public.revision_measure_database() returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('databaseBytes',pg_database_size(current_database()),'relations',coalesce((select jsonb_agg(jsonb_build_object('table',relname,'totalBytes',pg_total_relation_size(relid),'indexBytes',pg_indexes_size(relid))) from pg_catalog.pg_statio_user_tables),'[]'::jsonb),'observedAt',now()) $$;
revoke all on function public.revision_measure_database() from public,anon,authenticated;
grant execute on function public.revision_measure_database() to service_role;
create table if not exists public.revision_publication_events(version_id text primary key,menu_id text not null references public.menus(id) on delete cascade,created_at timestamptz not null default now());
alter table public.revision_publication_events enable row level security;revoke all on public.revision_publication_events from anon,authenticated;grant all on public.revision_publication_events to service_role;
create or replace function public.revision_publication_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if exists(select 1 from public.revision_config where id and enabled) and exists(select 1 from public.revision_menu_state where menu_id=new.menu_id and migrated) then
 insert into public.revision_publication_events(version_id,menu_id) values(new.published_version_id,new.menu_id) on conflict do nothing;
 insert into public.revision_jobs(menu_id,due_at) values(new.menu_id,now()) on conflict(menu_id) do update set due_at=least(revision_jobs.due_at,excluded.due_at);end if;return new;end $$;
drop trigger if exists revision_publication_outbox on public.menu_publications;
create trigger revision_publication_outbox after insert or update on public.menu_publications for each row execute function public.revision_publication_event();
create or replace function public.revision_published_version(p_menu text,p_actor uuid,p_editor jsonb,p_snapshot jsonb,p_operation text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.menu_versions;saved jsonb;begin
 perform public.revision_assert_actor(p_menu,p_actor);perform 1 from public.menus where id=p_menu for update;
 select result into saved from public.revision_operations where menu_id=p_menu and operation_id=p_operation;if saved is not null then return saved;end if;
 if octet_length(p_snapshot::text)>8388608 then raise exception 'Documento excede limite';end if;
 insert into public.menu_versions(id,menu_id,version_number,version_type,editor_state,render_snapshot,created_by)
 select gen_random_uuid()::text,p_menu,coalesce(max(version_number),0)+1,'published',p_editor,p_snapshot,p_actor from public.menu_versions where menu_id=p_menu returning * into v;
 saved:=jsonb_build_object('versionId',v.id,'versionNumber',v.version_number);insert into public.revision_operations(menu_id,operation_id,result) values(p_menu,p_operation,saved);return saved;end $$;
revoke all on function public.revision_published_version(text,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.revision_published_version(text,uuid,jsonb,jsonb,text) to service_role;
-- Reference ledger is a proof of reachability, not a refcount. Backfill before enabling asset GC.
create or replace function public.revision_document_assets(document jsonb) returns setof text language sql immutable set search_path=public,pg_temp as $$
 with recursive nodes(k,v) as(select ''::text,document union all select child.key,child.value from nodes n cross join lateral(
 select key,value from jsonb_each(case when jsonb_typeof(n.v)='object' then n.v else '{}'::jsonb end)
 union all select n.k,value from jsonb_array_elements(case when jsonb_typeof(n.v)='array' then n.v else '[]'::jsonb end)) child)
 select distinct case when k~*'asset_?ids?$' then v#>>'{}' else substring(v#>>'{}' from 9) end from nodes
 where jsonb_typeof(v)='string' and(k~*'asset_?ids?$' or v#>>'{}' like 'asset://%') $$;
create or replace function public.revision_track_assets() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare document jsonb;rid text;begin
 document:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;rid:=document->>'id';
 delete from public.revision_asset_refs where ref_type=tg_table_name and ref_id=rid;
 if tg_op<>'DELETE' then insert into public.revision_asset_refs(ref_type,ref_id,asset_id) select tg_table_name,rid,a from public.revision_document_assets(document) a join public.assets on assets.id=a order by a on conflict do nothing;end if;
 return case when tg_op='DELETE' then old else new end;end $$;
do $$ declare t text;begin foreach t in array array['menu_versions','menu_publications','template_versions','catalog_products','ai_import_jobs'] loop
 if to_regclass('public.'||t) is not null then execute format('drop trigger if exists revision_asset_ledger on public.%I',t);execute format('create trigger revision_asset_ledger after insert or update or delete on public.%I for each row execute function public.revision_track_assets()',t);end if;end loop;end $$;
create or replace function public.revision_asset_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare a public.assets;begin select * into a from public.assets where id=new.asset_id for share;
 if a.metadata->>'history_gc_status'='deleting' then raise exception 'Recurso em coleta; referência recusada';end if;return new;end $$;
drop trigger if exists revision_asset_ref_guard on public.revision_asset_refs;
create trigger revision_asset_ref_guard before insert on public.revision_asset_refs for each row execute function public.revision_asset_guard();
create or replace function public.revision_gc_assets(p_limit int default 10) returns setof public.assets language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.revision_config;begin select * into c from public.revision_config where id;
 if not c.asset_inventory_complete or exists(select 1 from public.revision_leases where expires_at>now()) then return;end if;
 return query update public.assets a set metadata=metadata||jsonb_build_object('history_gc_status','deleting','history_gc_generation',coalesce((metadata->>'history_gc_generation')::int,0)+1) where a.id in(
 select x.id from public.assets x where x.metadata->>'immutable'='true' and x.metadata->>'revision_asset'='true' and x.created_at<now()-make_interval(secs=>c.grace_seconds)
 and x.bucket is not null and x.path is not null and not exists(select 1 from public.revision_asset_refs r where r.asset_id=x.id)
 order by x.created_at limit least(20,greatest(1,p_limit)) for update skip locked) returning a.*;end $$;
revoke all on function public.revision_gc_assets(int) from public,anon,authenticated;grant execute on function public.revision_gc_assets(int) to service_role;
create table if not exists public.revision_rate_windows(scope text primary key,window_start timestamptz not null,requests int not null);
alter table public.revision_rate_windows enable row level security;revoke all on public.revision_rate_windows from anon,authenticated;grant all on public.revision_rate_windows to service_role;
create or replace function public.revision_rate_limit(p_actor uuid,p_menu text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;n int;begin
 foreach k in array array['actor:'||p_actor::text,'menu:'||p_menu] loop
 insert into public.revision_rate_windows(scope,window_start,requests) values(k,date_trunc('minute',now()),1)
 on conflict(scope) do update set window_start=excluded.window_start,requests=case when revision_rate_windows.window_start=excluded.window_start then revision_rate_windows.requests+1 else 1 end returning requests into n;
 if n>120 then raise exception 'Muitas solicitações; aguarde um momento' using errcode='P0001';end if;end loop;end $$;
revoke all on function public.revision_rate_limit(uuid,text) from public,anon,authenticated;grant execute on function public.revision_rate_limit(uuid,text) to service_role;
create or replace function public.revision_record_metrics(p_metrics jsonb,p_healthy boolean default true) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.revision_config;peak numeric:=0;ratio numeric;v_level int;k text;reserved numeric;begin
 select * into c from public.revision_config where id for update;
 foreach k in array array['database','disk','storage','egressCached','egressUncached','cpu','memory'] loop
 select coalesce(sum(case when k='storage' then bytes when k='database' then 4096 when k='disk' then 8192 else 0 end),0) into reserved from public.revision_reservations where expires_at>now();
 if (p_metrics->k->>'used') is not null and (p_metrics->k->>'limit')::numeric>0 and (p_metrics->k->>'observedAt')::timestamptz>now()-interval '15 minutes' then
 ratio:=((p_metrics->k->>'used')::numeric+reserved)/(p_metrics->k->>'limit')::numeric;peak:=greatest(peak,ratio);end if;end loop;
 v_level:=case when peak>=.95 then 95 when peak>=.85 then 85 when peak>=.70 then 70 when peak>=.50 then 50 else 0 end;
 if c.capacity_level=95 and(peak>=c.recovery_ratio or not p_healthy or exists(select 1 from jsonb_each(c.metrics) m where (m.value->>'used')::numeric/nullif((m.value->>'limit')::numeric,0)>=c.recovery_ratio and ((p_metrics->m.key->>'observedAt') is null or (p_metrics->m.key->>'observedAt')::timestamptz<now()-interval '15 minutes'))) then v_level:=95;end if;
 if v_level>=50 and(v_level>c.capacity_level or not exists(select 1 from public.revision_capacity_alerts a where a.level=v_level and a.created_at>now()-interval '1 hour')) then insert into public.revision_capacity_alerts(level,reason) values(v_level,'Limiar interno de capacidade; consultar métricas e reservas verificadas');end if;
 update public.revision_config set metrics=p_metrics,capacity_level=v_level,updated_at=now() where id;return v_level;end $$;
revoke all on function public.revision_record_metrics(jsonb,boolean) from public,anon,authenticated;grant execute on function public.revision_record_metrics(jsonb,boolean) to service_role;
create or replace function public.revision_inventory_refs(p_table text,p_cursor text default '',p_limit int default 100) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row jsonb;last_id text:=p_cursor;n int:=0;begin
 if not p_table=any(array['menu_versions','menu_publications','template_versions','catalog_products','ai_import_jobs']) then raise exception 'Tabela não autorizada';end if;
 if to_regclass('public.'||p_table) is null then return jsonb_build_object('cursor',p_cursor,'count',0);end if;
 for row in execute format('select to_jsonb(t) from public.%I t where id>$1 order by id limit $2',p_table) using p_cursor,least(100,greatest(1,p_limit)) loop
 last_id:=row->>'id';n:=n+1;
 insert into public.revision_asset_refs(ref_type,ref_id,asset_id) select p_table,last_id,a from public.revision_document_assets(row) a join public.assets on assets.id=a order by a on conflict do nothing;
 end loop;return jsonb_build_object('cursor',last_id,'count',n);end $$;
revoke all on function public.revision_inventory_refs(text,text,int) from public,anon,authenticated;grant execute on function public.revision_inventory_refs(text,text,int) to service_role;
create table if not exists public.revision_capacity_alerts(id bigint generated always as identity primary key,level int not null,created_at timestamptz not null default now(),acknowledged_at timestamptz,reason text not null);
alter table public.revision_capacity_alerts enable row level security;revoke all on public.revision_capacity_alerts from anon,authenticated;grant all on public.revision_capacity_alerts to service_role;
create index if not exists revision_capacity_alerts_recent on public.revision_capacity_alerts(created_at desc);
-- Only the new immutable asset domain is unique; verified legacy duplicates are left untouched.
create unique index if not exists revision_assets_dedup on public.assets(workspace_id,checksum) where checksum is not null and metadata->>'revision_asset'='true';
create or replace function public.revision_storage_guard(p_bucket text,p_name text,p_delete boolean) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when not public.is_workspace_member(split_part(p_name,'/',1)) then true else exists(select 1 from public.assets a where a.bucket=p_bucket and a.path=p_name and(case when p_delete then exists(select 1 from public.revision_asset_refs r where r.asset_id=a.id) else a.metadata->>'immutable'='true' end)) end $$;
revoke all on function public.revision_storage_guard(text,text,boolean) from public,anon;grant execute on function public.revision_storage_guard(text,text,boolean) to authenticated,service_role;
-- Older browser sessions cannot overwrite/delete immutable referenced files.
drop policy if exists revision_immutable_storage_update on storage.objects;
create policy revision_immutable_storage_update on storage.objects as restrictive for update to authenticated
 using(not public.revision_storage_guard(bucket_id,name,false));
drop policy if exists revision_referenced_storage_delete on storage.objects;
create policy revision_referenced_storage_delete on storage.objects as restrictive for delete to authenticated
 using(not public.revision_storage_guard(bucket_id,name,true));
create or replace function public.revision_queue_initial() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if exists(select 1 from public.revision_config where id and enabled) and not exists(select 1 from public.revision_menu_state where menu_id=new.menu_id and migrated) then
 insert into public.revision_jobs(menu_id,due_at) values(new.menu_id,now()) on conflict(menu_id) do update set due_at=least(revision_jobs.due_at,excluded.due_at);end if;return new;end $$;
drop trigger if exists revision_initial_outbox on public.menu_versions;
create trigger revision_initial_outbox after insert on public.menu_versions for each row execute function public.revision_queue_initial();
create or replace function public.revision_guard_draft_pointer() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if current_user in('authenticated','anon') and new.current_draft_version_id is distinct from old.current_draft_version_id and exists(select 1 from public.revision_menu_state r where r.menu_id=new.id and r.migrated) then raise exception 'Atualize o AutoMenu antes de salvar este cardápio';end if;return new;end $$;
drop trigger if exists revision_draft_pointer_guard on public.menus;
create trigger revision_draft_pointer_guard before update on public.menus for each row execute function public.revision_guard_draft_pointer();
create or replace function public.revision_remove_state_refs() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin delete from public.revision_asset_refs where ref_type='state' and ref_id=old.id;return old;end $$;
drop trigger if exists revision_state_refs_cleanup on public.revision_states;
create trigger revision_state_refs_cleanup after delete on public.revision_states for each row execute function public.revision_remove_state_refs();
-- Hourly operational aggregates, not another history stream. Histograms give bounded latency estimates.
create table if not exists public.revision_telemetry(namespace text not null,observed_hour timestamptz not null,samples bigint not null default 0,wall_ms double precision not null default 0,cpu_micros bigint not null default 0,payload_bytes bigint not null default 0,memory_peak bigint not null default 0,latency_buckets bigint[] not null default array_fill(0::bigint,array[12]),primary key(namespace,observed_hour));
alter table public.revision_telemetry enable row level security;revoke all on public.revision_telemetry from anon,authenticated;grant all on public.revision_telemetry to service_role;
create or replace function public.revision_observe(p_namespace text,p_ms double precision,p_cpu bigint,p_bytes bigint,p_memory bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare bucket int;bounds int[]:=array[1,5,10,25,50,100,250,500,1000,2500,5000,2147483647];begin
 select min(i) into bucket from generate_series(1,12) i where p_ms<=bounds[i];
 insert into public.revision_telemetry(namespace,observed_hour,samples,wall_ms,cpu_micros,payload_bytes,memory_peak,latency_buckets)
 values(p_namespace,date_trunc('hour',now()),1,p_ms,p_cpu,p_bytes,p_memory,array(select case when i=bucket then 1::bigint else 0::bigint end from generate_series(1,12) i))
 on conflict(namespace,observed_hour) do update set samples=revision_telemetry.samples+1,wall_ms=revision_telemetry.wall_ms+p_ms,cpu_micros=revision_telemetry.cpu_micros+p_cpu,payload_bytes=revision_telemetry.payload_bytes+p_bytes,memory_peak=greatest(revision_telemetry.memory_peak,p_memory),latency_buckets=array(select revision_telemetry.latency_buckets[i]+case when i=bucket then 1 else 0 end from generate_series(1,12) i);
end $$;
revoke all on function public.revision_observe(text,double precision,bigint,bigint,bigint) from public,anon,authenticated;grant execute on function public.revision_observe(text,double precision,bigint,bigint,bigint) to service_role;
create or replace function public.revision_assert_assets(p_namespace text,p_assets text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if cardinality(p_assets)>10000 or exists(select 1 from unnest(p_assets) wanted(asset_id) where not public.revision_asset_authorized(p_namespace,wanted.asset_id)) then raise exception 'Recurso não autorizado ou indisponível' using errcode='42501';end if;end $$;
revoke all on function public.revision_assert_assets(text,text[]) from public,anon,authenticated;grant execute on function public.revision_assert_assets(text,text[]) to service_role;
create index if not exists revision_operations_expiry on public.revision_operations(expires_at);
create index if not exists revision_leases_expiry on public.revision_leases(expires_at);
create index if not exists revision_reservations_expiry on public.revision_reservations(expires_at);
create or replace function public.revision_housekeeping() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 delete from public.revision_leases where id in(select id from public.revision_leases where expires_at<now() order by expires_at limit 1000);
 delete from public.revision_reservations where operation_id in(select operation_id from public.revision_reservations where expires_at<now() order by expires_at limit 1000);
 delete from public.revision_operations where(menu_id,operation_id) in(select menu_id,operation_id from public.revision_operations where expires_at<now() order by expires_at limit 1000);
 delete from public.revision_rate_windows where scope in(select scope from public.revision_rate_windows where window_start<now()-interval '2 hours' limit 1000);
end $$;
revoke all on function public.revision_housekeeping() from public,anon,authenticated;grant execute on function public.revision_housekeeping() to service_role;
-- Bounded economic rebase candidates: only exclusively needed, logically unreferenced ancestors count as reclaimable.
create or replace function public.revision_rebase_candidates(p_limit int default 3) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 with candidates as(select s.* from public.revision_states s where s.representation='delta'
 and exists(select 1 from public.menu_revisions r where r.state_id=s.id)
 and not exists(select 1 from public.menu_revisions r where r.state_id=s.base_state_id)
 order by s.chain_depth desc,s.id limit least(3,greatest(1,p_limit)))
 select coalesce(jsonb_agg(jsonb_build_object('state',to_jsonb(c),'reclaimableBytes',c.byte_length+coalesce((
 with recursive exclusive(id,base_id,bytes,depth) as(
 select b.id,b.base_state_id,b.byte_length,1 from public.revision_states b where b.id=c.base_state_id
 and not exists(select 1 from public.menu_revisions r where r.state_id=b.id)
 and (select count(*) from public.revision_states d where d.base_state_id=b.id)=1
 union all select b.id,b.base_state_id,b.byte_length,e.depth+1 from public.revision_states b join exclusive e on b.id=e.base_id
 where e.depth<49 and not exists(select 1 from public.menu_revisions r where r.state_id=b.id)
 and (select count(*) from public.revision_states d where d.base_state_id=b.id)=1)
 select sum(bytes) from exclusive),0))),'[]'::jsonb) from candidates c $$;
revoke all on function public.revision_rebase_candidates(int) from public,anon,authenticated;grant execute on function public.revision_rebase_candidates(int) to service_role;
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('revision_document_assets','revision_track_assets','revision_asset_guard','revision_queue_initial','revision_guard_legacy','revision_guard_draft_pointer','revision_remove_state_refs','revision_publication_event') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
-- Cheap central probe. Physical disk/WAL/billing/egress/CPU/RAM remain separate unavailable metrics.
create or replace function public.revision_measure_capacity() returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('databaseBytes',pg_database_size(current_database()),'storageBytes',coalesce(sum(case when metadata->>'size'~'^\d+$' then(metadata->>'size')::bigint else 0 end),0),'storageMissingSizes',count(*) filter(where metadata->>'size' is null or metadata->>'size'!~'^\d+$'),'observedAt',now()) from storage.objects $$;
revoke all on function public.revision_measure_capacity() from public,anon,authenticated;grant execute on function public.revision_measure_capacity() to service_role;
create or replace function public.revision_advance_legacy(p_menu text,p_version bigint) returns void language sql security definer set search_path=public,pg_temp as $$
 update public.revision_menu_state set legacy_cursor=greatest(legacy_cursor,p_version) where menu_id=p_menu $$;
create or replace function public.revision_finish_migration(p_menu text,p_actor uuid,p_current text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.menus;r public.menu_revisions;begin
 perform public.revision_assert_actor(p_menu,p_actor);select * into m from public.menus where id=p_menu for update;
 perform 1 from public.revision_menu_state where menu_id=p_menu and migrated for update;if found then return;end if;
 if m.current_draft_version_id<>p_current then raise exception 'Cardápio mudou durante migração' using errcode='40001';end if;
 if exists(select 1 from public.menu_versions v where v.menu_id=p_menu and not exists(select 1 from public.menu_revisions h where h.legacy_version_id=v.id)) then raise exception 'Migração do histórico pendente';end if;
 select * into r from public.menu_revisions where legacy_version_id=p_current and menu_id=p_menu;
 if not found then raise exception 'Estado corrente ainda não migrado';end if;
 update public.revision_menu_state set migrated=true,last_revision_id=r.id,durable_hash=r.state_hash,pending_first=null,pending_last=null where menu_id=p_menu;
end $$;
revoke all on function public.revision_advance_legacy(text,bigint),public.revision_finish_migration(text,uuid,text) from public,anon,authenticated;
grant execute on function public.revision_advance_legacy(text,bigint),public.revision_finish_migration(text,uuid,text) to service_role;
-- Bounded seed; the administrative backfill command queues remaining menus by cursor.
insert into public.revision_jobs(menu_id,due_at) select m.id,now() from public.menus m where m.current_draft_version_id is not null and not exists(select 1 from public.revision_menu_state r where r.menu_id=m.id and r.migrated) order by m.id limit 100 on conflict do nothing;
