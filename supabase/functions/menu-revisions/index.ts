// Thin deployment adapter. Domain, codec, repository and authorization are shared with Node.
// @ts-ignore Deno resolves the SDK through the bundled npm import.
import { revisionHandlerWithOptions, configuredRevisionService } from './bundle.js';
declare const Deno: { env: { toObject(): Record<string,string> }; serve(handler:(request:Request)=>Promise<Response>):void };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Cache-Control': 'private, no-store' };
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
async function boundedJson(request:Request) {
    const reader=request.body?.getReader(); if(!reader) return {};
    const chunks:Uint8Array[]=[];let size=0;
    for(;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>9*1024*1024){await reader.cancel();throw new Error('request_too_large');}chunks.push(value); }
    const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
    return size?JSON.parse(new TextDecoder().decode(all)):{};
}
Deno.serve(async request => {
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(!['GET','POST'].includes(request.method)) return json({error:'Método inválido.'},405);
    try {
        const body=request.method==='POST'?await boundedJson(request):{};
        // Vault token is sent only by pg_cron. It is never accepted as a user's JWT.
        if(body.action==='worker') {
            const service=configuredRevisionService();
            const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
            if(!/^[a-f0-9]{64}$/.test(token)||!await service.repo.rpc('revision_worker_authorized',{p_token:token})) return json({error:'Acesso negado.'},401);
            const jobs=await service.runJobs(3);
            return json({jobs,gcEnabled:false});
        }
        let status=200, result:unknown, extra:Record<string,string>={};
        const res={setHeader:(key:string,value:string)=>{extra[key]=value;},status:(code:number)=>{status=code;return res;},json:(data:unknown)=>{result=data;},end:()=>{}};
        const req={method:request.method,headers:{authorization:request.headers.get('authorization')||undefined},body,query:Object.fromEntries(new URL(request.url).searchParams)};
        await revisionHandlerWithOptions(req,res,{enabled:true});
        return new Response(JSON.stringify(result),{status,headers:{...cors,...extra,'Content-Type':'application/json'}});
    } catch(error) {
        const large=(error as Error).message==='request_too_large';
        return json({error:large?'Documento excede o limite de requisição.':'Backend de histórico indisponível. Consulte o diagnóstico interno.'},large?413:503);
    }
});
