import {isTestContact} from './private-contacts.ts';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {paths} from './paths.ts';
import {writeJson,readJson} from './store.ts';
import {refreshNotion} from './notion-prospects.ts';
import {syncBigin} from './bigin-sync.ts';
import {prospectLibrary} from './prospect-library.ts';
export async function crmRequest(body?:Record<string,unknown>){
 const key=process.env.HERMES_CRM_KEY;if(!key)throw Error('CRM bridge is not configured.');
 const r=await fetch('http://127.0.0.1:3100/api/hermes',{method:body?'POST':'GET',headers:{'x-hermes-crm-key':key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const result=await r.json();if(!r.ok)throw Error(result.error||'CRM unavailable');return result;
}
async function pythonJob(script:string,input:unknown){const runtime=await promisify(execFile)(paths.hermesBin,['--print-runtime-command'],{timeout:10000});const [python]=JSON.parse(runtime.stdout);return new Promise<{ ok: boolean; unresolved?: string[]; [key: string]: unknown }>((resolve,reject)=>{const child=spawn(python,['-I',path.join(process.cwd(),'scripts',script)],{stdio:['pipe','pipe','pipe']});let out='';const timer=setTimeout(()=>{child.kill();reject(Error('Sync timed out. The next run will check existing records before creating anything.'));},600000);child.stdout.on('data',c=>{out+=c;if(out.length>15000000)child.kill();});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('Sync could not start'));});child.on('close',()=>{clearTimeout(timer);try{const r=JSON.parse(out.trim().split('\n').at(-1)!);if(!r.ok)throw Error(r.error||'Sync failed');resolve(r);}catch{reject(Error('Sync failed. Existing records were preserved.'));}});child.stdin.end(JSON.stringify(input));});}
let busy=false;
export async function syncOutreach(force=false){
 if(busy)return {skipped:true};
 const prior=readJson<{checkedAt?:string;lastAttempt?:string}>('outreach-sync',{});if(!force&&(prior.lastAttempt||prior.checkedAt)&&Date.now()-Date.parse((prior.lastAttempt||prior.checkedAt)!)<10*60000)return {skipped:true};
 busy=true;try{
 await refreshNotion(true);await crmRequest({action:'suppress',emails:prospectLibrary().prospects.filter(p=>p.doNotContact).map(p=>p.email).filter(Boolean)});
 await crmRequest({action:'prepare'});const snapshot=await crmRequest();
 const notion=await pythonJob('outreach-notion.py',snapshot);await refreshNotion(true);
 const eligible=prospectLibrary().prospects.filter(p=>p.email&&!p.doNotContact&&p.status!=='rejected'&&!isTestContact(p.email));
 const bigin=await syncBigin(eligible.map(p=>p.id));
 const library=prospectLibrary();await crmRequest({action:'suppress',emails:library.prospects.filter(p=>p.doNotContact).map(p=>p.email).filter(Boolean)});const mappings=library.prospects.flatMap(p=>{const id=p.sourceIds.match(/lead:(\d+)/)?.[1];return id&&p.biginId?[{leadId:Number(id),biginId:p.biginId}]:[];});
 await crmRequest({action:'link',mappings});
 const notes=await pythonJob('outreach-notes.py',{messages:snapshot.messages,mappings});
 const state={checkedAt:new Date().toISOString(),notion,bigin,notes,health:snapshot.health,error:notion.unresolved?.length?`${notion.unresolved.length} Notion source IDs need reconciliation after an uncertain create. Automatic retries are blocked.`:null};writeJson('outreach-sync',state);return state;
 }catch(e){writeJson('outreach-sync',{...prior,lastAttempt:new Date().toISOString(),error:e instanceof Error?e.message:'Sync failed'});throw e;}finally{busy=false;}
}
