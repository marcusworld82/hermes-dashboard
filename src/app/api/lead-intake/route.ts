import {body,handle} from '@/lib/server/http';
import {parseLeadIntake,intakeRecords,musePrompt,type IntakeLead} from '@/lib/server/lead-intake';
import {syncLeadResearchRecords} from '@/lib/server/lead-actions';
import {newId,readJson,writeJson} from '@/lib/server/store';
import {readFinder} from '@/lib/server/claude-finder';
type Preview={id:string;origin:'Muse'|'Claude finder';leads:IntakeLead[];at:number;state:'preview'|'importing'|'imported'|'uncertain'};
export async function GET(){return handle(()=>({prompt:musePrompt}));}
export async function POST(req:Request){return handle(async()=>{
 const b=await body<{action:string;text?:string;origin?:string;previewId?:string}>(req);
 if(b.action==='preview'){
  const origin=b.origin==='Claude finder'?'Claude finder':'Muse';
  const raw=origin==='Claude finder'?JSON.stringify(readFinder()?.leads??[]):b.text??'';
  const preview:Preview={id:newId('preview'),origin,leads:parseLeadIntake(raw),at:Date.now(),state:'preview'};writeJson('lead-intake-preview',preview);return {preview};
 }
 if(b.action==='import'){
  const p=readJson<Preview|null>('lead-intake-preview',null);if(!p||p.id!==b.previewId||p.state!=='preview'||Date.now()-p.at>30*60000)throw Error('Preview expired or already submitted. Preview again before import.');
  writeJson('lead-intake-preview',{...p,state:'importing'});
  try{const result=await syncLeadResearchRecords(intakeRecords(p.leads,p.origin));writeJson('lead-intake-preview',{...p,state:'imported'});return {result};}
  catch(e){writeJson('lead-intake-preview',{...p,state:'uncertain'});throw e;}
 }
 throw Error('Unknown intake action.');
});}
