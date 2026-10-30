import {privateStorage} from './private-storage.ts';
import {validBackground} from '../studio-composition.ts';
import {SHAPES} from '../studio-design.ts';
const KEY='hermes/creative-studio/v1/drafts.json';
export function validateStudioDraft(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid draft');
 const v=value as Record<string,unknown>;
 if(typeof v.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)||typeof v.idea!=='string'||v.idea.length>1000||!['image','video','carousel'].includes(String(v.kind))||!Object.hasOwn(SHAPES,String(v.shape))||!['Big Number','Editorial','Cinematic'].includes(String(v.look))||!Array.isArray(v.slides)||![4,6,8,10].includes(v.slides.length))throw new Error('Invalid draft choices');
 for(const s of v.slides)if(!s||typeof s.number!=='string'||typeof s.headline!=='string'||typeof s.line!=='string'||s.number.length>80||s.headline.length>200||s.line.length>200)throw new Error('Invalid slide words');
 const backgrounds=v.backgrounds||{};if(typeof backgrounds!=='object'||Array.isArray(backgrounds)||Object.entries(backgrounds).some(([k,b])=>!/^\d+$/.test(k)||Number(k)>=10||!validBackground(b)))throw new Error('Invalid saved background');
 return {id:v.id,idea:v.idea,kind:v.kind,shape:v.shape,look:v.look,slides:v.slides.map(s=>({number:s.number,headline:s.headline,line:s.line})),backgrounds:Object.fromEntries(Object.entries(backgrounds).map(([k,b])=>{const v=b as {jobId:string;outputIndex:number;downloadUrl:string};return [k,{jobId:v.jobId,outputIndex:v.outputIndex,downloadUrl:v.downloadUrl}]}))};
}
export function studioDraftStore(blob=privateStorage()){
 async function read(){const stored=await blob.get(KEY,{access:'private',useCache:false});if(!stored)return {drafts:[] as ReturnType<typeof validateStudioDraft>[],etag:undefined};if(stored.statusCode!==200||!stored.stream||stored.blob.size>1024*1024)throw new Error('Draft storage unavailable');const value=await new Response(stored.stream).json();if(!Array.isArray(value)||value.length>60)throw new Error('Invalid draft storage');return {drafts:value.map(validateStudioDraft),etag:stored.blob.etag};}
 return {list:async()=>(await read()).drafts,async save(value:unknown){const draft=validateStudioDraft(value);for(let i=0;i<5;i++){const old=await read(),drafts=[draft,...old.drafts.filter(d=>d.id!==draft.id)].slice(0,60);try{await blob.put(KEY,JSON.stringify(drafts),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!old.etag,...(old.etag?{ifMatch:old.etag}:{})});return draft;}catch(error){if(!(error instanceof Error)||(!/already exists/i.test(error.message)&&error.name!=='BlobPreconditionFailedError'))throw error;}}throw new Error('Drafts changed concurrently. Retry saving.');}};
}
