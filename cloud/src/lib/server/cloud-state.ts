import {get,put} from '@vercel/blob';
export type CloudState={version:1;bridgeUrl:string;syncedAt:string;responses:Record<string,unknown>};
export async function readState():Promise<CloudState|null>{const blob=await get('hermes/state.json',{access:'private',useCache:false});if(!blob?.stream)return null;return await new Response(blob.stream).json() as CloudState}
export async function saveState(state:CloudState){await put('hermes/state.json',JSON.stringify(state),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:0})}
