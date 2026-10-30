import {handleUpload} from '@vercel/blob/client';
import {StorageClient} from '@supabase/storage-js';
import {createCutlineDirectHTTP} from './cutline-cloud-direct.mjs';
import {createCutlineBlobBackend} from './cutline-cloud-store.mjs';
import {createCutlineProjects} from './cutline-cloud-projects.mjs';
import {privateStorage} from './private-storage';
import {configuredSupabaseBlob} from './hermes-storage.mjs';
export const cutlineCloudDirectHTTP=createCutlineDirectHTTP({handleUpload,async loadResources(){
 const blob=privateStorage(),backend=createCutlineBlobBackend({blob,approvedBudget:undefined});
 const result={blob,uploads:backend.uploads,projects:createCutlineProjects({blob,repository:backend.repository})};
 if(process.env.HERMES_STORAGE_PROVIDER!=='supabase')return result;
 const url=process.env.HERMES_SUPABASE_URL!,secret=process.env.HERMES_SUPABASE_SECRET_KEY!;
 const storage=new StorageClient(url+'/storage/v1',{apikey:secret,...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{})});
 return {...result,registerUpload:configuredSupabaseBlob().registerUploaded,async signUpload(path:string){
  if(!/^objects\/[a-f0-9-]{36}$/.test(path))throw Error('Invalid upload path');
  const {data,error}=await storage.from('hermes-private').createSignedUploadUrl(path,{upsert:false});if(error||!data?.signedUrl)throw Error('Private upload signing unavailable');
  const target=new URL(data.signedUrl);if(target.origin!==url||!target.pathname.startsWith('/storage/v1/object/upload/sign/hermes-private/')||!target.pathname.endsWith(path))throw Error('Unexpected private upload destination');
  return target.href;
 }};
}});
