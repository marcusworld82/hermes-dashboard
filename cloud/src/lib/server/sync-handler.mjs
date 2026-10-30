import {authorizedBearer,safeTunnel,safeApiPath} from './security.mjs';
/** @param {Request} req */
export async function handleSync(req,{secret,readState,saveState}) {
 if(!authorizedBearer(req.headers.get('authorization'),secret)) return Response.json({error:'Unauthorized'},{status:401});
 const raw=await req.text();
 if(Buffer.byteLength(raw)>3_900_000) return Response.json({error:'Snapshot too large'},{status:413});
 let data;
 try {
  data=JSON.parse(raw);
  if(data?.version!==1||!safeTunnel(data.bridgeUrl)) throw Error('Invalid snapshot');
  if(data.registerOnly!==true&&(!data.responses||typeof data.responses!=='object'||Array.isArray(data.responses)||Object.keys(data.responses).some(p=>!safeApiPath(p)))) throw Error('Invalid snapshot');
 } catch { return Response.json({error:'Invalid cloud snapshot.'},{status:400}); }
 try {
  if(data.registerOnly===true) {
   const previous=await readState();
   await saveState({version:1,bridgeUrl:data.bridgeUrl,syncedAt:previous?.syncedAt??new Date().toISOString(),responses:previous?.responses??{}});
  } else {
   await saveState({version:1,bridgeUrl:data.bridgeUrl,syncedAt:new Date().toISOString(),responses:data.responses});
  }
  return Response.json({ok:true});
 } catch {
  return Response.json({error:'Cloud storage is unavailable. The local Mac app is unchanged.',storageUnavailable:true},{status:503,headers:{'Retry-After':'1800'}});
 }
}
