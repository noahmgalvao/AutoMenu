/** Run only inside an authenticated administrative harness. Creates/deletes exclusively its own fixtures.
 * Never log/return credentials, tokens, document contents or existing user identifiers. */
import { externalizeEmbeddedAssets } from '../src/infrastructure/revisions/embeddedAssets';
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import type { RevisionService } from '../src/infrastructure/revisions/service';
import { editorOf } from '../src/infrastructure/revisions/service';
import { resultOf } from '../src/infrastructure/revisions/repository';
import { canonicalize } from '../src/domain/revisions/canonical';
export async function validateLiveRevisions(service:RevisionService) {
 const db=service.repo.db, run=crypto.randomUUID(), email=`revision-validation-${run}@example.invalid`,password=crypto.randomUUID()+crypto.randomUUID();
 let actor:string|undefined,workspace:string|undefined,phase='create-fixture';const checks:string[]=[];const times:Record<string,number>={};
 const check=(condition:unknown,name:string)=>{if(!condition)throw new Error(name);checks.push(name);};
 const doc=(n:number)=>({products:[{id:'fixture-product',category:'Categoria',name:'Produto',price:n,description:'Ingredientes'}],style:{menuTitle:'Histórico — validação isolada'},sortOption:{field:'name',direction:'asc'}});
 const start=performance.now();
 try {
  const user=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{workspace_name:'Histórico — fixture automática'}});if(user.error)throw user.error;actor=user.data.user.id;
  const member=await resultOf(db.from('workspace_members').select('workspace_id').eq('user_id',actor).single());workspace=member.workspace_id;
  const menuId=crypto.randomUUID(),versionId=crypto.randomUUID();
  await resultOf(db.from('menus').insert({id:menuId,workspace_id:workspace,name:'Histórico — fixture automática'}));
  await resultOf(db.from('menu_versions').insert({id:versionId,menu_id:menuId,version_number:1,version_type:'draft',editor_state:editorOf(doc(0)),render_snapshot:doc(0),created_by:actor,action_label:'Cardápio criado'}));
  await resultOf(db.from('menus').update({current_draft_version_id:versionId}).eq('id',menuId));
  console.info('revision-validation: '+phase);phase='authentication';
  const key=process.env.SUPABASE_ANON_KEY||JSON.parse(process.env.SUPABASE_PUBLISHABLE_KEYS||'{}').default;
  const client=createClient(process.env.SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;const token=login.data.session!.access_token;
  const endpoint=`${process.env.SUPABASE_URL}/functions/v1/menu-revisions`;
  const invoke=async(action:string,input:Record<string,unknown>={},expected=200)=>{const response=await fetch(endpoint,{signal:AbortSignal.timeout(15000),method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,menuId,operationId:`${Date.now()}_${crypto.randomUUID()}`,...input})});const result=await response.json();check(response.status===expected,`http-${action}-${expected}${response.status!==expected?'-'+response.status+'-'+String(result.code||result.error).slice(0,180):''}`);return result;};
  console.info('revision-validation: '+phase);phase='migrate';await invoke('migrate');times.migrateMs=performance.now()-start;
  const original=(await invoke('page')).items[0];check(original.protection==='original','original-protected');
  console.info('revision-validation: '+phase);phase='save-manual';let t=performance.now();await invoke('save',{expectedWrite:0,snapshot:doc(1),editor:editorOf(doc(1))});times.saveMs=performance.now()-t;
  t=performance.now();const operationId=`${Date.now()}_${crypto.randomUUID()}`;const manual=await invoke('manual',{expectedWrite:1,name:'Versão 1',defaultName:true,operationId});times.manualMs=performance.now()-t;check(manual.name==='Versão 1','manual-counter-1');
  check((await invoke('manual',{expectedWrite:1,name:'Outro',operationId})).id===manual.id,'manual-idempotent');
  await invoke('save',{expectedWrite:0,snapshot:doc(2),editor:editorOf(doc(2))},409);
  let sqlConflict=false;try{await service.repo.rpc('revision_save_draft',{p_menu:menuId,p_actor:actor,p_expected:0,p_operation:'fixture-stale',p_editor:editorOf(doc(2)),p_snapshot:doc(2),p_hash:'0'.repeat(64)});}catch(error){sqlConflict=(error as any)?.code==='PT409';}check(sqlConflict,'atomic-sql-cas-conflict');
  console.info('revision-validation: '+phase);phase='read-restore-copy';check(canonicalize(await invoke('load',{revisionId:manual.id}))===canonicalize(doc(1)),'private-blob-roundtrip');
  t=performance.now();await invoke('restore',{revisionId:original.id,expectedWrite:1});times.restoreMs=performance.now()-t;
  check(canonicalize((await service.repo.current(menuId)).document)===canonicalize(doc(0)),'restore-current');
  check((await invoke('page')).items.some((r:any)=>r.id===manual.id),'restore-keeps-future');
  const copied=await invoke('copy',{revisionId:manual.id});check(copied.menuId!==menuId,'independent-copy');check(canonicalize((await service.repo.current(copied.menuId)).document)===canonicalize(doc(1)),'copy-roundtrip');
  console.info('revision-validation: '+phase);phase='rls-and-bucket';const unauthorized=createClient(process.env.SUPABASE_URL!,key,{auth:{persistSession:false}});
  const anon=await unauthorized.from('menu_revisions').select('id').eq('menu_id',menuId);check(!!anon.error||anon.data?.length===0,'anon-rls-denied');
  const visible=await client.from('menu_revisions').select('id').eq('menu_id',menuId);check(!visible.error&&!!visible.data?.length,'owner-rls-visible');
  const blobs=await resultOf(db.from('revision_blobs').select('*').eq('namespace',workspace));const first=blobs[0];
  const publicAccess=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${first.bucket}/${first.object_key}`);check(!publicAccess.ok,'public-blob-denied');
  const forbidden=await client.rpc('revision_assert_actor',{p_menu:menuId,p_actor:actor});check(!!forbidden.error,'service-rpc-denied-to-user');
  let denied=false;try{await service.repo.authorize(menuId,crypto.randomUUID());}catch{denied=true;}check(denied,'cross-account-denied');
  const stateRows=await resultOf(db.from('revision_states').select('byte_length,raw_length,representation').eq('namespace',workspace));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
  const externalized:any=await externalizeEmbeddedAssets(db,workspace!,actor!,{image:`data:image/svg+xml,${encodeURIComponent(svg)}`});
  const asset=await resultOf(db.from('assets').select('bucket,path').eq('id',externalized.imageAssetId).single());
  const downloaded=await db.storage.from(asset.bucket).download(asset.path);
  check(!downloaded.error&&await downloaded.data!.text()===svg,'svg-original-lossless-private');
  const capacity=await service.repo.rpc('revision_measure_capacity');
  return {ok:true,checks,times,totalMs:performance.now()-start,fixture:{logicalStates:stateRows.length,compressedBytes:stateRows.reduce((s:number,r:any)=>s+Number(r.byte_length),0),rawBytes:stateRows.reduce((s:number,r:any)=>s+Number(r.raw_length),0),blobCount:blobs.length},capacity};
 } catch(error) { return {ok:false,phase,checks,times,error:{message:String((error as any)?.message||error).slice(0,250),code:(error as any)?.code},totalMs:performance.now()-start}; }
 finally {
  // Only objects under this freshly created Auth workspace are eligible for cleanup.
  console.info('revision-validation: cleanup');
  if(workspace){for(const bucket of ['revision-blobs','menu-assets']){const prefix=bucket==='menu-assets'?`${workspace}/revision-assets`:workspace;const listed=await db.storage.from(bucket).list(prefix,{limit:1000});const names=(listed.data||[]).filter(o=>o.id).map(o=>`${prefix}/${o.name}`);if(names.length){const removed=await db.storage.from(bucket).remove(names);if(removed.error)throw new Error('Fixture object cleanup failed');}}}
  if(actor){const removed=await db.auth.admin.deleteUser(actor);if(removed.error)throw new Error(`Fixture user cleanup failed: ${removed.error.code}`);}
 }
}
