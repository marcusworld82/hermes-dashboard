import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { paths } from './paths.ts';
import { prospectLibrary, normalizeReceipt } from './prospect-library.ts';
import { intakeRootDomain } from './lead-intake.ts';
export type OutreachIdentity = { email?: string; phone?: string; website?: string };
export type LegacyOutreachRow = OutreachIdentity & { id?: string; doNotContact?: boolean; stage?: string; status?: string; links?: {label:string;url:string}[]; drafts?: {status?:unknown;sent_at?:unknown;[key:string]:unknown}[]; messages?: {direction?:unknown;[key:string]:unknown}[] };
export type LegacyOutreachHistory = { prospects: LegacyOutreachRow[]; suppressedEmails: string[]; checkedAt: number };
const MAX_AGE = 30 * 60_000;
const normalized=(value:unknown)=>String(value||'').trim().toLowerCase();
function domain(value:string|undefined){if(!value)return '';try{const root=intakeRootDomain(value.includes('://')?value:'https://'+value);return new Set(['facebook.com','instagram.com','linkedin.com','google.com','youtube.com','x.com','twitter.com','airbnb.com','remax.com','kw.com','zillow.com','realtor.com']).has(root)?'':root;}catch{return '';}}
function phone(value:string|undefined){const digits=(value||'').replace(/\D/g,'');if(digits.length<7)return '';return digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;}
function matches(lead:OutreachIdentity,row:LegacyOutreachRow){
  const email=normalized(lead.email),number=phone(lead.phone),root=domain(lead.website);
  return !!(email&&email===normalized(row.email)||number&&number===phone(row.phone)||root&&root===domain(row.website||row.links?.find(link=>link.label==='Website')?.url));
}
export function legacyOutreachBlock(lead:OutreachIdentity,kind:'first'|'followup',history:LegacyOutreachHistory):string|null {
  if(!history||!Array.isArray(history.prospects)||!Array.isArray(history.suppressedEmails)||!Number.isFinite(history.checkedAt)||Date.now()-history.checkedAt>MAX_AGE) return 'Legacy outreach history is unavailable or stale. Refresh legacy Notion and Bigin before approval.';
  if(history.suppressedEmails.some(email=>normalized(email)===normalized(lead.email)&&normalized(email)))return 'This email is permanently suppressed in the legacy CRM.';
  const rows=history.prospects.filter(row=>matches(lead,row));
  for(const row of rows){
    const states=[normalized(row.stage),normalized(row.status)];
    if(row.doNotContact||states.some(value=>['do not contact','denied','rejected','archived','suppressed','unsubscribed','not interested','bounced'].includes(value)))return 'This business or contact is suppressed, denied or archived in legacy Prospects.';
    const inbound=row.messages?.some(message=>['in','incoming','inbound','received'].includes(normalized(message.direction)));
    if(inbound||states.some(value=>['replied','meeting','booked','client','closed'].includes(value)))return 'Legacy history already has a reply, meeting or client relationship. Review it before any outreach.';
    if(states.includes('test contact'))return 'This is a legacy test contact, not a lead for outreach.';
    if(states.includes('paused'))return 'This legacy contact is paused.';
    if(!Array.isArray(row.drafts)||!Array.isArray(row.messages))return 'Legacy message history is incomplete. Approval is blocked until it can be read.';
    const outbound=row.messages.some(message=>['out','outgoing','outbound','sent'].includes(normalized(message.direction)));
    const prior=outbound||row.drafts.some(draft=>draft.sent_at||['sent','delivered','opened','clicked','sending','queued','approved','unknown'].includes(normalized(draft.status)))||states.some(value=>['sent','contacted','delivered','opened','clicked','sending','queued','approved','unknown'].includes(value));
    if(prior)return kind==='first'?'Legacy outreach was already sent or queued for this business. A second first email is blocked.':'Legacy outreach exists. Its follow-up and reply history must be reconciled before moving the sequence to Gmail.';
    if(row.messages.some(message=>!['in','incoming','inbound','received','out','outgoing','outbound','sent'].includes(normalized(message.direction)))||row.drafts.some(draft=>!['draft','cancelled','canceled','rejected','failed'].includes(normalized(draft.status))))return 'Legacy message state is unknown. Review the history before approval.';
  }
  return null;
}
function read(file:string){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Legacy outreach history is missing or unreadable. Restore and refresh it before approving emails.');}}
export function loadLegacyOutreachHistory(options:{crmDir?:string;data?:string;readLibrary?:()=>ReturnType<typeof prospectLibrary>;now?:number}={}):LegacyOutreachHistory {
  const crmDir=options.crmDir||paths.crmDir,data=options.data||paths.data,now=options.now??Date.now();
  const receipt=read(path.join(crmDir,'data/notion-migration/receipt.json'));
  const original=normalizeReceipt(receipt);
  const live=read(path.join(data,'notion-prospect-live.json'));
  const bigin=read(path.join(data,'bigin-prospect-sync.json'));
  for(const cache of [live,bigin])if(typeof cache.checkedAt!=='string'||!Number.isFinite(Date.parse(cache.checkedAt))||now-Date.parse(cache.checkedAt)>MAX_AGE||Date.parse(cache.checkedAt)>now+60000||cache.error)throw Error('Legacy Notion or Bigin history is stale or failed. Refresh both before approving emails.');
  if(!Array.isArray(live.pages)||!Array.isArray(bigin.mappings))throw Error('Legacy outreach cache is incomplete.');
  if(bigin.mappings.some((mapping:{error?:unknown})=>mapping.error))throw Error('Legacy Bigin history has unresolved sync errors. Refresh it before approval.');
  normalizeReceipt({pages:live.pages});
  const file=path.join(crmDir,'data/studio.db');if(!fs.existsSync(file))throw Error('Live legacy CRM history is unavailable. An import snapshot cannot prove outreach is safe.');
  const db=new DatabaseSync(file,{readOnly:true});let suppressedEmails:string[];
  try{suppressedEmails=db.prepare('SELECT email FROM suppression').all().map(row=>String(row.email||''));}finally{db.close();}
  const library=(options.readLibrary||prospectLibrary)();
  if(library.mode!=='local_live'||!Array.isArray(library.prospects))throw Error('Live legacy CRM history is unavailable. An import snapshot cannot prove outreach is safe.');
  // Preserve prior permanent suppression even if a later cache accidentally clears it.
  const permanent=original.filter(row=>row.doNotContact||['denied','rejected','suppressed','archived','contacted','sent','replied','meeting','booked','client','closed'].includes(normalized(row.status))).map(row=>({...row,stage:row.doNotContact?'Do not contact':row.status,drafts:[],messages:[]}));
  return {prospects:[...library.prospects,...permanent],suppressedEmails,checkedAt:now};
}
export function assertLegacyOutreachAllowed(lead:OutreachIdentity,kind:'first'|'followup'='first') {
  const block=legacyOutreachBlock(lead,kind,loadLegacyOutreachHistory());if(block)throw Error(block);
}
