-- Optional Supabase Edge deployment of the shared backend; no secret leaves Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
alter table public.revision_config add column if not exists worker_url text;
alter table public.revision_telemetry add column if not exists cpu_samples bigint not null default 0;
alter table public.revision_telemetry add column if not exists memory_samples bigint not null default 0;
create or replace function public.revision_observe(p_namespace text,p_ms double precision,p_cpu bigint,p_bytes bigint,p_memory bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare bucket int;bounds int[]:=array[1,5,10,25,50,100,250,500,1000,2500,5000,2147483647];begin
 select min(i) into bucket from generate_series(1,12) i where p_ms<=bounds[i];
 insert into public.revision_telemetry(namespace,observed_hour,samples,wall_ms,cpu_micros,payload_bytes,memory_peak,latency_buckets,cpu_samples,memory_samples)
 values(p_namespace,date_trunc('hour',now()),1,p_ms,coalesce(p_cpu,0),p_bytes,coalesce(p_memory,0),array(select case when i=bucket then 1::bigint else 0::bigint end from generate_series(1,12) i),case when p_cpu is null then 0 else 1 end,case when p_memory is null then 0 else 1 end)
 on conflict(namespace,observed_hour) do update set samples=revision_telemetry.samples+1,wall_ms=revision_telemetry.wall_ms+p_ms,cpu_micros=revision_telemetry.cpu_micros+coalesce(p_cpu,0),payload_bytes=revision_telemetry.payload_bytes+p_bytes,memory_peak=greatest(revision_telemetry.memory_peak,coalesce(p_memory,0)),latency_buckets=array(select revision_telemetry.latency_buckets[i]+case when i=bucket then 1 else 0 end from generate_series(1,12) i),cpu_samples=revision_telemetry.cpu_samples+case when p_cpu is null then 0 else 1 end,memory_samples=revision_telemetry.memory_samples+case when p_memory is null then 0 else 1 end;
end $$;
revoke all on function public.revision_observe(text,double precision,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.revision_observe(text,double precision,bigint,bigint,bigint) to service_role;
do $$begin
 if not exists(select 1 from vault.secrets where name='automenu_revision_worker') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'automenu_revision_worker','Private revision worker credential');end if;
end $$;
create or replace function public.revision_worker_authorized(p_token text) returns boolean language sql security definer set search_path=public,pg_temp as $$
 select length(p_token)=64 and exists(select 1 from vault.decrypted_secrets where name='automenu_revision_worker' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(p_token,'sha256'));
$$;
revoke all on function public.revision_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.revision_worker_authorized(text) to service_role;
create or replace function public.revision_dispatch_worker() returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.revision_config;secret text;request_id bigint;begin
 select * into c from public.revision_config where id;
 if not c.enabled or c.worker_url is null then return null;end if;
 if not(c.worker_url~'^https://[a-z0-9]+\.supabase\.co/functions/v1/menu-revisions$') then raise exception 'URL do worker inválida';end if;
 if not exists(select 1 from public.revision_jobs where due_at<=now() and coalesce(lease_until,'-infinity')<now())
 and coalesce((c.metrics->'database'->>'observedAt')::timestamptz,'-infinity')>now()-interval '15 minutes' then return null;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='automenu_revision_worker';
 if secret is null then raise exception 'Credencial do worker indisponível';end if;
 select net.http_post(url:=c.worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function public.revision_dispatch_worker() from public,anon,authenticated;
grant execute on function public.revision_dispatch_worker() to service_role;
-- A single central job; skips HTTP traffic when idle. Enabled only by revision_config.
select cron.schedule('automenu-revisions-v12','* * * * *','select public.revision_dispatch_worker()');
