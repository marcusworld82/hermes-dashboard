import {safeApiPath,safeTunnel} from '@/lib/server/security.mjs';
import {readState} from '@/lib/server/cloud-state';
export const maxDuration=300;
async function relay(req:Request){
 const url=new URL(req.url);const path=url.pathname+url.search;
 if(!safeApiPath(path))return Response.json({error:'Unknown dashboard route.'},{status:404});
 const state=await readState().catch(()=>null);
 const method=req.method;const reading=method==='GET'||method==='HEAD';let sent=false;
 if(state&&safeTunnel(state.bridgeUrl)){
  try{
   // Check liveness before sending a write. Never retry a write after dispatch.
   if(!reading){const ping=await fetch(state.bridgeUrl+'/api/agents',{headers:{Authorization:`Bearer ${process.env.HERMES_BRIDGE_KEY}`},signal:AbortSignal.timeout(5000),redirect:'error',cache:'no-store'});if(!ping.ok||ping.headers.get('x-hermes-relay')!=='1'||!Array.isArray((await ping.json()).agents))throw Error('Offline')}
   const headers:Record<string,string>={Authorization:`Bearer ${process.env.HERMES_BRIDGE_KEY}`};if(req.headers.get('content-type'))headers['content-type']=req.headers.get('content-type')!;
   if(req.headers.get('range'))headers.Range=req.headers.get('range')!;
   const body=reading?undefined:await req.arrayBuffer();sent=!reading;
   const live=await fetch(state.bridgeUrl+path,{method,headers,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(reading?25000:270000)});
   if(live.headers.get('x-hermes-relay')==='1'){const out:Record<string,string>={'Content-Type':live.headers.get('content-type')??'application/json','Cache-Control':'private, no-store','X-Hermes-Source':'live'};for(const h of ['x-slide-flags','content-disposition','accept-ranges','content-range','content-length']){const v=live.headers.get(h);if(v)out[h]=v}return new Response(live.body,{status:live.status,headers:out})}
  }catch{}
 }
 if(reading&&state&&Object.hasOwn(state.responses,path))return Response.json(state.responses[path],{headers:{'Cache-Control':'private, no-store','X-Hermes-Source':'saved','X-Hermes-Synced-At':state.syncedAt}});
 return Response.json({error:sent?'The connection ended after the request was sent. Check the result on your Mac before trying again.':'Your Mac is offline or this view has not synced yet. Saved views remain available. Reconnect your Mac to make changes.',offline:true,unknownOutcome:sent},{status:503});
}
export {relay as GET,relay as POST,relay as PUT,relay as PATCH,relay as DELETE,relay as HEAD};
