import {isTestContact} from './private-contacts.ts';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {paths} from './paths.ts';
import {prospectLibrary} from './prospect-library.ts';
import {readJson,writeJson} from './store.ts';
let syncing=false;
export async function syncBigin(ids?:string[]){
 if(syncing)throw Error('Bigin sync is already running.');syncing=true;
 try{
 const rows=prospectLibrary().prospects;
 const selected=ids?rows.filter(p=>ids.includes(p.id)):rows;
 if(ids&&selected.length!==new Set(ids).size)throw Error('A selected prospect was not found.');
 const prospects=selected.map(p=>({...p,eligible:!p.doNotContact&&!!p.email&&!isTestContact(p.email)}));
 const runtime=await promisify(execFile)(paths.hermesBin,['--print-runtime-command'],{timeout:10000});const [python]=JSON.parse(runtime.stdout);
 const result=await new Promise<{ok:boolean;mappings:{id:string;biginId?:string;doNotContact?:boolean;error?:string}[];error?:string}>((resolve,reject)=>{
 const child=spawn(python,['-I',path.join(process.cwd(),'scripts/bigin-prospects.py')],{stdio:['pipe','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Bigin sync timed out. Refresh before retrying.'));},240000);child.stdout.on('data',c=>{output+=c;if(output.length>1000000)child.kill();});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('Could not start Bigin sync.'));});child.on('close',()=>{clearTimeout(timer);try{resolve(JSON.parse(output.trim().split('\n').at(-1)!));}catch{reject(Error('Bigin sync did not return a result. Refresh before retrying.'));}});child.stdin.end(JSON.stringify({promote:!!ids,prospects:prospects.map(p=>({id:p.id,name:p.name,contact:p.contact,email:p.email,phone:p.phone,city:p.city,notionUrl:p.notionUrl,eligible:p.eligible}))}));
 });
 if(!result.ok)throw Error(result.error||'Bigin sync failed.');
 const previous=readJson<{mappings:typeof result.mappings}>('bigin-prospect-sync',{mappings:[]});
 const mappings=[...previous.mappings.filter(p=>!result.mappings.some(m=>m.id===p.id)),...result.mappings];
 const state={checkedAt:new Date().toISOString(),mappings};writeJson('bigin-prospect-sync',state);return {linked:result.mappings.filter(m=>m.biginId).length,errors:result.mappings.filter(m=>m.error),checkedAt:state.checkedAt};
 }finally{syncing=false;}
}
