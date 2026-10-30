import {randomUUID} from 'node:crypto';
const BUCKET='hermes-private';
export function supabaseStorageConfigured(env=process.env){return env.HERMES_STORAGE_PROVIDER==='supabase'&&/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.HERMES_SUPABASE_URL||'')&&!!env.HERMES_SUPABASE_SECRET_KEY;}
/** Immutable media plus a Postgres compare-and-swap head. No public bucket, deletion,
 * credential exposure, or fallback to a different store after a failed operation. */
export function createSupabaseBlob({url,secret,fetcher=fetch,makeId=randomUUID}){
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!secret)throw new Error('Supabase server configuration required');
 const headers={apikey:secret,...(secret.startsWith('eyJ')?{Authorization:`Bearer ${secret}`}:{})};
 const path=p=>{if(typeof p!=='string'||p.length>512||!p.split('/').every(s=>/^[a-zA-Z0-9_.-]+$/.test(s)&&s!=='.'&&s!=='..')||!(/^(hermes\/|cutline\/private\/)/.test(p)))throw new Error('Invalid Hermes object path');return p;};
 async function request(route,options={}){const r=await fetcher(url+route,{...options,headers:{...headers,...options.headers},redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`Hermes private storage request failed (${r.status})`);return r;}
 async function metadata(key){path(key);const r=await request('/rest/v1/hermes_objects?select=*&logical_key=eq.'+encodeURIComponent(key));const rows=await r.json();if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid storage metadata');return rows[0]||null;}
 const conflict=()=>Object.assign(new Error('Storage changed concurrently or object already exists'),{name:'BlobPreconditionFailedError'});
 return {
  async get(key,options={}){const row=await metadata(key);if(!row)return null;if(!/^objects\/[a-f0-9-]{36}$/.test(row.object_path))throw new Error('Invalid storage reference');const r=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+row.object_path,{signal:options.abortSignal});return {statusCode:200,stream:r.body,blob:{pathname:key,size:row.size,contentType:row.content_type,etag:row.etag}};},
  async head(key){const row=await metadata(key);if(!row)throw new Error('Object not found');return {pathname:key,size:row.size,contentType:row.content_type,etag:row.etag};},
  async put(key,body,options={}){
   path(key);if(options.access!=='private'||options.addRandomSuffix!==false)throw new Error('Private deterministic storage required');
   const content=typeof body==='string'?Buffer.from(body):Buffer.isBuffer(body)?body:body instanceof Uint8Array?Buffer.from(body):null;
   if(!content||content.length>134217728)throw new Error('Unsupported or oversized storage body');
   const prior=await metadata(key);if(options.ifMatch?prior?.etag!==options.ifMatch:!!prior)throw conflict();
   const objectPath='objects/'+makeId(),etag=makeId();
   await request('/storage/v1/object/'+BUCKET+'/'+objectPath,{method:'POST',headers:{'Content-Type':options.contentType||'application/octet-stream','x-upsert':'false'},body:content,signal:options.abortSignal});
   const r=await request('/rest/v1/rpc/hermes_commit_object',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:key,p_expected:options.ifMatch||null,p_path:objectPath,p_etag:etag,p_type:options.contentType||'application/octet-stream',p_size:content.length})});
   if(await r.json()!==true)throw conflict();
   return {pathname:key,size:content.length,contentType:options.contentType,etag};
  },
  async registerUploaded(key,objectPath,expectedSize){
   path(key);if(!/^objects\/[a-f0-9-]{36}$/.test(objectPath)||!Number.isSafeInteger(expectedSize)||expectedSize<32||expectedSize>134217728)throw new Error('Invalid private upload allocation');
   const existing=await metadata(key);if(existing){if(existing.object_path===objectPath&&existing.size===expectedSize)return;throw conflict();}
   const response=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath);
   const size=Number(response.headers.get('content-length')),type=response.headers.get('content-type')?.split(';')[0];await response.body?.cancel();
   if(size!==expectedSize||type!=='video/mp4')throw new Error('Uploaded MP4 does not match its allocation');
   const result=await request('/rest/v1/rpc/hermes_commit_object',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:key,p_expected:null,p_path:objectPath,p_etag:makeId(),p_type:type,p_size:size})});if(await result.json()!==true)throw conflict();
  },
  async del(){throw new Error('Automatic deletion is disabled for Hermes storage');},
 };
}
export function configuredSupabaseBlob(env=process.env){if(!supabaseStorageConfigured(env))throw new Error('Configure Hermes Supabase server credentials');return createSupabaseBlob({url:env.HERMES_SUPABASE_URL,secret:env.HERMES_SUPABASE_SECRET_KEY});}
