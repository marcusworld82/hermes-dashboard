import {authorizedBearer,safeTunnel,safeApiPath} from '@/lib/server/security.mjs';
import {saveState,readState} from '@/lib/server/cloud-state';
export const maxDuration=60;
export async function POST(req:Request){
 if(!authorizedBearer(req.headers.get('authorization'),process.env.HERMES_BRIDGE_KEY))return Response.json({error:'Unauthorized'},{status:401});
 const raw=await req.text();if(Buffer.byteLength(raw)>3_900_000)return Response.json({error:'Snapshot too large'},{status:413});
 try{const data=JSON.parse(raw);if(data.registerOnly===true){if(data.version!==1||!safeTunnel(data.bridgeUrl))throw Error('Invalid registration');const previous=await readState();await saveState({version:1,bridgeUrl:data.bridgeUrl,syncedAt:previous?.syncedAt??new Date().toISOString(),responses:previous?.responses??{}});return Response.json({ok:true})}if(data.version!==1||!safeTunnel(data.bridgeUrl)||!data.responses||typeof data.responses!=='object'||Array.isArray(data.responses)||Object.keys(data.responses).some(p=>!safeApiPath(p)))throw Error('Invalid snapshot');
 await saveState({version:1,bridgeUrl:data.bridgeUrl,syncedAt:new Date().toISOString(),responses:data.responses});return Response.json({ok:true});
 }catch{return Response.json({error:'Snapshot could not be saved'},{status:400})}
}
