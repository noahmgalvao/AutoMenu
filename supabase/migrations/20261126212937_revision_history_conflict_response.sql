-- Application CAS conflicts are HTTP 409, not retryable database serialization failures.
do $$declare f record;begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('revision_commit','revision_save_draft','revision_compact','revision_finish_migration') loop
 execute replace(pg_get_functiondef(f.oid),'errcode=''40001''','errcode=''PT409''');
 end loop;end $$;
