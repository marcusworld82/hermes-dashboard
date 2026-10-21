import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.ts';
import { intakeRootDomain } from './lead-intake.ts';
export type LegacyProspect = {id:string;sourceIds:string;name:string;contact?:string;email:string;phone:string;notionUrl:string;doNotContact:boolean;stage:string;status?:string;address?:string;links:{label:string;url:string}[];research:{label:string;value:string}[];noteText?:string;drafts?:{status:string;subject:string;body:string}[]};
type Master = {companies:{stableId:string;website:string;email:string;phone:string;stage:string;outreachStatus?:string}[];people:{email:string;phone:string;stage:string}[];evidence:{stableId:string}[]};
const digest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function publicUrl(value:string){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')&&!/(^localhost$|\.local$|^127\.|^10\.|^192\.168\.|^169\.254\.|:)/i.test(u.hostname)&&!(/facebook\.com$/.test(u.hostname)&&u.pathname.includes('/groups/'))?u.href:'';}catch{return '';}}
function domain(value:string){try{const root=intakeRootDomain(value);return /^(facebook|instagram|linkedin|twitter|x|youtube|google|airbnb|remax|kw)\.com$/.test(root)?'':root;}catch{return '';}}
function keys(row:{website?:string;email:string;phone:string}){const digits=row.phone.replace(/\D/g,'');return [domain(row.website||'')?'d:'+domain(row.website||''):'',row.email?'e:'+row.email.toLowerCase().trim():'',digits?'p:'+(digits.length===11&&digits[0]==='1'?digits.slice(1):digits):''].filter(Boolean);}
export function planProspectPromotion(selectedIds:string[], legacy:LegacyProspect[], master:Master) {
  if(!Array.isArray(selectedIds)||!selectedIds.length||selectedIds.length>100||new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>typeof id!=='string'||id.length>100))throw Error('Choose 1 to 100 unique prospects.');
  const masterKeys=new Set([...master.companies,...master.people].flatMap(keys));
  const suppressedKeys=new Set(legacy.filter(row=>row.doNotContact||['Do not contact','Archived','Denied'].includes(row.stage)).flatMap(row=>keys({...row,website:row.links.find(l=>l.label==='Website')?.url})));
  const suppressedSources=new Set(legacy.filter(row=>row.doNotContact||['Do not contact','Archived','Denied'].includes(row.stage)).map(row=>row.sourceIds).filter(Boolean));
  const sourceIds=new Set(master.evidence.map(row=>row.stableId));
  const companies:Record<string,unknown>[]=[];const evidence:Record<string,unknown>[]=[];
  const rows:{id:string;name:string;status:'ready'|'skipped';reason:string;record?:Record<string,unknown>;sourceIds?:string;sources?:string[]}[]=[];
  for(const id of selectedIds){
    const row=legacy.find(row=>row.id===id);if(!row)throw Error('A selected prospect no longer exists. Refresh.');
    const website=publicUrl(row.links.find(l=>l.label==='Website')?.url||'');const identity=keys({...row,website});
    const evidenceId='ev:legacy-prospect:'+digest(row.sourceIds || row.id.replaceAll('-','')).slice(0,24);
    const skip=(reason:string)=>rows.push({id,name:row.name,status:'skipped',reason});
    if(row.doNotContact||suppressedSources.has(row.sourceIds)||['Do not contact','Archived','Denied','Test contact'].includes(row.stage)||identity.some(key=>suppressedKeys.has(key))){skip('Suppressed, archived, denied or test contact.');continue;}
    if(sourceIds.has(evidenceId)||identity.some(key=>masterKeys.has(key))){skip('Already in the master list or duplicated in this selection.');continue;}
    if(!row.sourceIds||!publicUrl(row.notionUrl)||!row.name.trim()){skip('Missing stable legacy mapping or source link.');continue;}
    if(row.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.email)){skip('Email needs correction.');continue;}
    if(!identity.length){skip('No website or public contact identifier to deduplicate.');continue;}
    const stableId=domain(website)?'co:domain:'+domain(website):'co:legacy:'+digest(row.sourceIds).slice(0,24);
    if(master.companies.some(company=>company.stableId===stableId)){skip('Stable legacy identity already exists.');continue;}
    const observations=row.research.filter(r=>/property fact|propertyFact/i.test(r.label)).map(r=>r.value).filter(Boolean);
    const reason=observations.join('; ').slice(0,1800)||'Imported legacy prospect. Review the saved source before outreach.';
    const stage=row.stage==='Replied'?'Replied':row.stage==='Contacted'?'Sent':row.stage==='Meeting'?'Meeting':row.stage==='Closed'?'Client':'New';
    const draft=row.drafts?.find(d=>d.status==='draft');
    const company={name:row.name,stable_id:stableId,root_domain:domain(website),website:domain(website)?website:'',general_email:row.email,general_phone:row.phone,address:row.address||'',owner_or_decision_maker:row.contact||'',lead_origin:'Manual',stage,reason,confidence:'Low',first_found:new Date().toISOString().slice(0,10),outreach_status:'Needs review',contactability:row.email||row.phone?'General contact only':'None found',...(draft?{draft_email:`Subject: ${draft.subject}\n\n${draft.body}`}:{})};
    companies.push(company);evidence.push({title:`Legacy prospect: ${row.name}`,stable_id:evidenceId,evidence_type:'Observation',source_url:row.notionUrl,confidence:'Low',observation:`Copied from legacy Prospects, not independently verified. Source IDs: ${row.sourceIds}. ${reason}`,_relations:{company_page_ids:[stableId]}});
    for(const link of row.research.filter(r=>/source/i.test(r.label))){const url=publicUrl(link.value);if(url)evidence.push({title:`Legacy source: ${row.name}`,stable_id:evidenceId+':'+digest(url).slice(0,12),evidence_type:'Contact source',source_url:url,confidence:'Low',observation:'Source link retained from legacy research; review before outreach.',_relations:{company_page_ids:[stableId]}});}
    identity.forEach(key=>masterKeys.add(key));sourceIds.add(evidenceId);rows.push({id,name:row.name,status:'ready',reason:'Copy to Notion for review. Original retained.',record:company,sourceIds:row.sourceIds,sources:[row.notionUrl,...row.research.map(link=>publicUrl(link.value)).filter(Boolean)]});
  }
  return {rows,records:{companies,people:[],opportunities:[],evidence,run_log:[]},sourceHash:digest(selectedIds.map(id=>legacy.find(row=>row.id===id)))};
}
async function fresh(){
  if(process.env.VERCEL||process.env.HERMES_DEPLOYMENT_MODE==='persistent-host')throw Error('Legacy promotion requires the local CRM on Marcus’s Mac.');
  const {refreshNotion}=await import('./notion-prospects.ts');const refreshed=await refreshNotion(true);if(refreshed.skipped)throw Error('Legacy refresh is already running. Wait before previewing.');
  const {refreshLeadResearch}=await import('./lead-research.ts');const master=await refreshLeadResearch(true);if(master.error)throw Error(master.error);
  if(!master.checkedAt||Date.now()-Date.parse(master.checkedAt)>60000)throw Error('A fresh Notion master read is required.');
  const {prospectLibrary}=await import('./prospect-library.ts');return {legacy:prospectLibrary().prospects as LegacyProspect[],master};
}
const dir=()=>path.join(paths.data,'prospect-promotion');
export async function previewProspectPromotion(ids:string[]){if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||id.length>100))throw Error('Choose 1 to 100 unique prospects.');const {legacy,master}=await fresh();const plan=planProspectPromotion(ids,legacy,master);const token=crypto.randomUUID();fs.mkdirSync(dir(),{recursive:true});fs.writeFileSync(path.join(dir(),token+'.json'),JSON.stringify({ids,sourceHash:plan.sourceHash,recordsHash:digest(plan.records),expiresAt:Date.now()+10*60000}),{flag:'wx',mode:0o600});return {token,rows:plan.rows,expiresInMinutes:10};}
export async function confirmProspectPromotion(token:unknown,confirmed:unknown){
  if(confirmed!==true||typeof token!=='string'||!/^[a-f0-9-]{36}$/.test(token))throw Error('Preview and explicitly confirm the migration.');
  const file=path.join(dir(),token+'.json');const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(saved.expiresAt<Date.now())throw Error('Preview expired. Preview again.');
  const lock=fs.openSync(file+'.used','wx',0o600);fs.closeSync(lock);
  try{const {legacy,master}=await fresh();const plan=planProspectPromotion(saved.ids,legacy,master);
    if(plan.sourceHash!==saved.sourceHash||digest(plan.records)!==saved.recordsHash)throw Error('The legacy or master records changed. Preview again.');
    if(!plan.records.companies.length)return {ok:true,created:0,message:'No new eligible records.'};
    const {syncLeadResearchRecords}=await import('./lead-actions.ts');const result=await syncLeadResearchRecords(plan.records);
    return {...result,message:'Saved to the Notion master. Original prospects retained. No sends created.'};
  }catch(error){throw Error(`${(error as Error).message} This preview is consumed. Check the master, then create a fresh preview.`);}
}
