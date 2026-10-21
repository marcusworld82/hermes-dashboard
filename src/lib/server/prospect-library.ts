import {isTestContact} from './private-contacts.ts';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {readJson} from './store.ts';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {paths} from './paths.ts';
export type Prospect = {id:string;name:string;contact:string;email:string;phone:string;sourceIds:string;recordType:string;brand:string;status:string;notionUrl:string;biginId:string;doNotContact:boolean};
type ImportedPage={id?:unknown;url?:unknown;properties?:Record<string,unknown>};
export function normalizeReceipt(receipt:{pages?:ImportedPage[]}):Prospect[]{
 if(!Array.isArray(receipt.pages))throw new Error('The Notion import receipt is missing its pages.');
 const ids=new Set<string>(),sources=new Set<string>();
 return receipt.pages.map(page=>{
  const p=page.properties||{};const text=(key:string)=>typeof p[key]==='string'?p[key] as string:'';
  const id=String(page.id||''),sourceIds=text('Source IDs');
  if(!id||!sourceIds)throw new Error('A prospect is missing its stable source mapping.');
  if(ids.has(id)||sources.has(sourceIds))throw new Error('Duplicate prospect mapping.');ids.add(id);sources.add(sourceIds);
  const url=String(page.url||'');
  return {id,name:text('Name'),contact:text('Contact name'),email:text('Email'),phone:text('Phone'),sourceIds,recordType:text('Record type'),brand:text('Brand'),status:text('CRM status'),notionUrl:/^https:\/\/(?:(?:www\.)?notion\.so\/[a-zA-Z0-9-]+|app\.notion\.com\/p\/[a-f0-9-]+(?:\?pvs=\d+)?$)/.test(url)?url:'',biginId:text('Bigin ID'),doNotContact:p['Do not contact']===true||['true','yes','1','__YES__'].includes(text('Do not contact'))};
 });
}
function renderSequence(template:string,l:Record<string,unknown>){return template.replace(/\{\{\s*first_name\s*\}\}/g,String(l.first_name||'').trim()).replace(/\{\{\s*company\s*\}\}/g,String(l.company||'your business').replace(/\s*\(fictional\)\s*/,'').trim()).replace(/\{\{\s*city\s*\}\}/g,String(l.city||'your area').trim()).replace(/^Hi ,/m,'Hi,').replace(/\{\{[^}]*\}\}/g,'');}
export function prospectLibrary(){
 const file=path.join(paths.crmDir,'data/notion-migration/receipt.json');
 if(!fs.existsSync(file))return {prospects:[],importedAt:null,mode:'not_imported',notionUrl:'https://www.notion.so/24eb9588cb804dff9c1781babdf5f31f'};
 const imported=JSON.parse(fs.readFileSync(file,'utf8'));
 const live=readJson<{pages:ImportedPage[];checkedAt?:string}>('notion-prospect-live',{pages:[]});
 const receipt=live.checkedAt?{pages:live.pages.map(page=>({...page,id:imported.pages.find((p:ImportedPage)=>String(p.id).replace(/-/g,'')===String(page.id).replace(/-/g,''))?.id||page.id}))}:imported;
 const prospects=normalizeReceipt(receipt);
 const dbFile=path.join(paths.crmDir,'data/studio.db');
 const db=fs.existsSync(dbFile)?new DatabaseSync(dbFile,{readOnly:true}):null;
 const sync=readJson<{checkedAt?:string;mappings:{id:string;biginId?:string;doNotContact?:boolean}[]}>('bigin-prospect-sync',{mappings:[]});
 const enriched=prospects.map(p=>{
 const mapping=sync.mappings.find(m=>m.id===p.id);
 const props=receipt.pages.find((x:ImportedPage)=>x.id===p.id)?.properties||{};
 const leadId=p.sourceIds.match(/lead:(\d+)/)?.[1];
 const prospectId=p.sourceIds.match(/prospect:(\d+)/)?.[1];
 const lead=db&&leadId?db.prepare('SELECT * FROM leads WHERE id=?').get(Number(leadId)):null;
 const prospect=db&&prospectId?db.prepare('SELECT * FROM prospects WHERE id=?').get(Number(prospectId)):null;
 const row=lead||prospect||{};
 const val=(key:string,fallback='')=>{if(key==='email'&&lead)return String(lead.email||'');const property=fallback||({email:'Email',phone:'Phone',city:'City'} as Record<string,string>)[key];return String((live.checkedAt&&property?props[property]:null)||row[key]||props[property]||'');};
 const drafts=db&&leadId?db.prepare('SELECT id,kind,subject,body,status,sent_at,created_at,campaign_id,step_no FROM drafts WHERE lead_id=? ORDER BY id DESC').all(Number(leadId)):[];
 const reviewDrafts=drafts.map(d=>({...d,version:crypto.createHash('sha256').update(`${String(lead?.email||'').trim().toLowerCase()}\n${d.subject}\n${d.body}`).digest('hex')}));
 const initial=drafts.find(d=>d.kind==='first'&&d.status==='draft');
 const steps=db&&initial?.campaign_id?db.prepare('SELECT * FROM sequence_steps WHERE campaign_id=? ORDER BY step_no').all(Number(initial.campaign_id)):[];
 const sequence=steps.length?{hash:crypto.createHash('sha256').update(JSON.stringify(steps.map(s=>[s.step_no,s.delay_days,s.subject,s.body]))).digest('hex'),steps:steps.map(s=>({...s,subject:renderSequence(String(s.subject),lead||{}),body:renderSequence(String(s.body),lead||{})}))}:null;
 const rejected=db&&leadId?db.prepare('SELECT v FROM settings WHERE k=?').get(`hermes_rejected:${leadId}`):null;
 const messages=db&&leadId?db.prepare('SELECT id,direction,subject,body,at FROM messages WHERE lead_id=? ORDER BY id DESC').all(Number(leadId)):[];
 let notes:Record<string,unknown>={}; let noteText=val('notes');
 try{notes=JSON.parse(noteText);noteText='';}catch{}
 const status=val('status')||p.status;
 const suppressed=mapping?.doNotContact||p.doNotContact||status==='suppressed'||!!(db&&p.email&&db.prepare('SELECT email FROM suppression WHERE lower(email)=lower(?)').get(p.email));
 const stage=isTestContact(p.email)?'Test contact':status==='rejected'?'Archived':!val('email')&&!p.email?'Needs contact':val('stage')==='closed'?'Closed':val('stage')==='booked'?'Meeting':status==='replied'?'Replied':status==='contacted'?'Contacted':'To review';
 const links=Object.entries({Website:val('website','Website'),LinkedIn:val('linkedin_url','LinkedIn'),Facebook:String(props.Facebook||''),Instagram:String(props.Instagram||''),TikTok:String(props.TikTok||''),'Contact form':String(props['Contact form']||'')}).filter(([,url])=>/^https?:\/\//i.test(url)).map(([label,url])=>({label,url}));
 return {...p,email:val('email')||p.email,phone:val('phone')||p.phone,status,doNotContact:suppressed,biginId:mapping?.biginId||val('bigin_id')||p.biginId,stage:suppressed?'Do not contact':rejected?'Archived':stage,city:val('city','City'),audience:val('audience','Audience'),title:val('title'),address:val('address'),links,leadId:leadId?Number(leadId):null,sequence,drafts:reviewDrafts,messages,noteText,research:Object.entries(notes).filter(([key,value])=>['propertyFact','propertySource','officialContactSource','deliverability','emailNote'].includes(key)&&typeof value==='string').map(([key,value])=>({label:key.replace(/([A-Z])/g,' $1'),value:String(value)}))};
 });
 db?.close();
 return {prospects:enriched,notionCheckedAt:live.checkedAt,biginCheckedAt:sync.checkedAt,checkedAt:new Date().toISOString(),importedAt:fs.statSync(file).mtime.toISOString(),mode:db?'local_live':'import_snapshot',notionUrl:'https://www.notion.so/24eb9588cb804dff9c1781babdf5f31f'};
}
