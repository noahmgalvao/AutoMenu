-- Freeze the candidate set before updating leases; do not re-evaluate candidates per updated row.
create or replace function public.revision_claim_jobs(p_token text,p_limit int default 10) returns setof public.revision_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.revision_config;active int;slots int;begin
 select * into c from public.revision_config where id for update;
 if not c.enabled or c.capacity_level>=95 or c.checkpoint_pause_reason is not null then return;end if;
 select count(*) into active from public.revision_jobs where lease_until>now();
 slots:=least(20,greatest(0,p_limit),greatest(0,(case when c.capacity_level>=85 then 1 else c.max_worker_concurrency end)-active));
 if slots=0 then return;end if;
 return query with candidates as materialized (
 select q.menu_id from public.revision_jobs q where q.due_at<=now() and(q.lease_until is null or q.lease_until<now())
 order by case when exists(select 1 from public.revision_menu_state r where r.menu_id=q.menu_id and r.migrated) then 0 else 1 end,q.due_at,q.menu_id limit slots for update of q skip locked)
 update public.revision_jobs j set lease_token=p_token,lease_until=now()+interval '2 minutes',attempts=j.attempts+1 from candidates picked where j.menu_id=picked.menu_id returning j.*;
end $$;
revoke all on function public.revision_claim_jobs(text,int) from public,anon,authenticated;
grant execute on function public.revision_claim_jobs(text,int) to service_role;
