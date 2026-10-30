import {get,put} from '@vercel/blob';
import {createStateCache} from './state-cache.mjs';
export type CloudState={version:1;bridgeUrl:string;syncedAt:string;responses:Record<string,unknown>};
const cache=createStateCache<CloudState|null>(async()=>{const blob=await get('hermes/state.json',{access:'private',useCache:true});if(!blob?.stream)return null;return await new Response(blob.stream).json() as CloudState});
export const readState=()=>cache.read();
export async function saveState(state:CloudState){await put('hermes/state.json',JSON.stringify(state),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});cache.replace(state)}
