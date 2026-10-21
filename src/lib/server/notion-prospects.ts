import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {paths} from './paths.ts';
import {readJson,writeJson} from './store.ts';
import {normalizeReceipt} from './prospect-library.ts';
const exec=promisify(execFile);let busy=false;
export async function refreshNotion(force=false){
 const prior=readJson<{checkedAt?:string}>('notion-prospect-live',{});
 if(!force&&prior.checkedAt&&Date.now()-Date.parse(prior.checkedAt)<30*60000)return {skipped:true,checkedAt:prior.checkedAt};
 if(busy)return {skipped:true};busy=true;
 try{const runtime=await exec(paths.hermesBin,['--print-runtime-command'],{timeout:10000});const [python]=JSON.parse(runtime.stdout);const out=await exec(python,['-I',path.join(process.cwd(),'scripts/notion-prospects.py')],{timeout:120000,maxBuffer:15000000});const result=JSON.parse(out.stdout.trim().split('\n').at(-1)!);if(!result.ok)throw Error(result.error);
 const pages=result.rows.map((props:Record<string,unknown>)=>{const url=String(props.url||'');const id=url.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9-]{27,})/i)?.[1];if(!id)throw Error('A Notion lead has no page ID.');return {id:id.replace(/-/g,''),url,properties:{...props,'Source IDs':props['Source IDs']||`notion:${id}`}};});
 // Match migrated IDs without changing their stable local mappings.
 normalizeReceipt({pages});const state={pages,checkedAt:new Date().toISOString()};writeJson('notion-prospect-live',state);return {count:pages.length,checkedAt:state.checkedAt};
 }finally{busy=false;}
}
