import {connection} from 'next/server';
import {readState} from '@/lib/server/cloud-state';
import {safeTunnel} from '@/lib/server/security.mjs';
export async function GET(){await connection();const state=await readState().catch(()=>null);let online=false;if(state&&safeTunnel(state.bridgeUrl)){try{const res=await fetch(state.bridgeUrl+'/api/agents',{headers:{Authorization:`Bearer ${process.env.HERMES_BRIDGE_KEY}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4000)});online=res.ok&&res.headers.get('x-hermes-relay')==='1'&&Array.isArray((await res.json()).agents)}catch{}}
return Response.json({online,syncedAt:state?.syncedAt??null},{headers:{'Cache-Control':'private, no-store'}})}
