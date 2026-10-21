import test from 'node:test';
import assert from 'node:assert/strict';
import { persistentMailHostBlock, persistentMailDispatchBlock } from '../src/lib/server/persistent-mail-host.ts';
import { createDirectNotionMailAdapter } from '../src/lib/server/notion-mail-direct.ts';
const company='1'.repeat(32), person='2'.repeat(32), companies='a'.repeat(32), people='b'.repeat(32);
const config={token:'private-test-token',companiesDataSource:companies,peopleDataSource:people};
const env={HERMES_DEPLOYMENT_MODE:'persistent-host',HERMES_DATA_DIR:'/var/lib/hermes/data',HERMES_PERSISTENT_DISK_CONFIRMED:'true',HERMES_LEGACY_SENDER_DISABLED:'true',HERMES_HISTORY_RECONCILED:'true'};
function page(id=company, source=companies) { return {object:'page',id,last_edited_time:'2026-10-20T10:00:00Z',parent:{data_source_id:source},properties:{Stage:{type:'select',select:{name:'New'}},'General Business Email':{type:'email',email:'business@example.com'},'Public Individual Business Email':{type:'email',email:'person@example.com'},'Draft Email':{type:'rich_text',rich_text:[{plain_text:'Subject: Test draft\n\nExact approved text'}]},'Pause Until':{type:'date',date:null},Company:{type:'relation',relation:[{id:company}]}}}; }
function setup(pages, allowStageWrites=false) { const calls=[]; const fetcher=async(url,init)=>{calls.push({url,init});const id=new URL(url).pathname.split('/')[3];const p=pages[id];if(!p)return new Response('',{status:404});if(init.method==='PATCH'){p.properties={...p.properties,...JSON.parse(init.body).properties};p.properties.Stage.type='select';}return Response.json(p);}; return {adapter:createDirectNotionMailAdapter({...config,allowStageWrites},fetcher),calls}; }
test('host requires durable disk and explicit old sender shutdown; serverless cannot bypass',()=>{
 assert.equal(persistentMailHostBlock(env),null);
 assert.equal(persistentMailHostBlock({...env,HERMES_LEGACY_SENDER_DISABLED:'false'}),null);
 assert.ok(persistentMailDispatchBlock({...env,HERMES_LEGACY_SENDER_DISABLED:'false'}));
 for(const extra of [{VERCEL:'1'},{AWS_LAMBDA_FUNCTION_NAME:'x'},{HERMES_DATA_DIR:'/tmp/mail'},{HERMES_PERSISTENT_DISK_CONFIRMED:'false'}])assert.ok(persistentMailHostBlock({...env,...extra}));
});
test('direct resolver returns exact draft from configured source and fixed API endpoint',async()=>{const {adapter,calls}=setup({[company]:page()});const lead=await adapter.email(`companies:${company}`);assert.equal(lead.subject,'Test draft');assert.equal(lead.body,'Exact approved text');assert.equal(lead.doNotContact,false);assert.ok(calls.every(c=>c.url.startsWith('https://api.notion.com/v1/pages/')));});
test('foreign source, archived page, and missing Stage all block',async()=>{for(const alter of [p=>p.parent.data_source_id=people,p=>p.archived=true,p=>delete p.properties.Stage]){const p=page();alter(p);await assert.rejects(setup({[company]:p}).adapter.email(`companies:${company}`));}});
test('fresh parent denial suppresses a person and changes its revision',async()=>{const p=page(person,people),c=page();const {adapter}=setup({[person]:p,[company]:c});const first=await adapter.email(`people:${person}`);c.properties.Stage.select.name='Denied';const second=await adapter.email(`people:${person}`);assert.equal(second.doNotContact,true);assert.notEqual(first.revision,second.revision);});
test('truncated parent relations fail closed',async()=>{const p=page(person,people);p.properties.Company.has_more=true;await assert.rejects(setup({[person]:p}).adapter.email(`people:${person}`),/Incomplete relations/);});
test('missing followup draft cannot reuse first email',async()=>{await assert.rejects(setup({[company]:page()}).adapter.email(`companies:${company}`,'followup'),/Subject/);});
test('stage writes require explicit review and reject stale revision without PATCH',async()=>{const p=page();const first=setup({[company]:p});await assert.rejects(first.adapter.updateStage(`companies:${company}`,'x','Sent'),/explicit deployment review/);assert.equal(first.calls.length,0);const next=setup({[company]:p},true);await assert.rejects(next.adapter.updateStage(`companies:${company}`,'stale','Sent'),/changed/);assert.equal(next.calls.some(c=>c.init.method==='PATCH'),false);});
test('reviewed delivery stage update changes only its named properties',async()=>{const {adapter,calls}=setup({[company]:page()},true);const lead=await adapter.snapshot(`companies:${company}`);await adapter.updateStage(lead.id,lead.revision,'Sent');const patch=calls.find(c=>c.init.method==='PATCH');assert.deepEqual(Object.keys(JSON.parse(patch.init.body).properties),['Stage']);});
test('transport errors never expose provider response or credential',async()=>{const adapter=createDirectNotionMailAdapter(config,async()=>new Response('private-test-token',{status:401}));await assert.rejects(adapter.email(`companies:${company}`),error=>error.message.includes('HTTP 401')&&!error.message.includes(config.token));});
test('second fresh revision check catches a human edit before PATCH',async()=>{
 const p=page();let reads=0,patches=0;
 const adapter=createDirectNotionMailAdapter({...config,allowStageWrites:true},async(_url,init)=>{if(init.method==='PATCH')patches++;if(++reads===3)p.properties['Draft Email'].rich_text[0].plain_text+=' human edit';return Response.json(p);});
 const lead=await adapter.snapshot(`companies:${company}`);
 await assert.rejects(adapter.updateStage(lead.id,lead.revision,'Sent'),/changed during/);
 assert.equal(patches,0);
});
test('long draft pagination decodes property ID and assembles all pages',async()=>{
 const p=page();p.properties['Draft Email']={type:'rich_text',id:'a%3Ab',rich_text:Array.from({length:25},()=>({plain_text:'truncated'}))};
 let propertyReads=0;
 const adapter=createDirectNotionMailAdapter(config,async(url)=>{
 if(url.includes('/properties/')){assert.ok(url.includes('/properties/a%3Ab?'));propertyReads++;return Response.json(propertyReads===1?{results:[{type:'rich_text',rich_text:{plain_text:'Subject: Whole\n\nFirst '}}],has_more:true,next_cursor:'next'}:{results:[{type:'rich_text',rich_text:{plain_text:'and last'}}],has_more:false});}
 return Response.json(p);
 });
 const lead=await adapter.email(`companies:${company}`);assert.equal(lead.body,'First and last');assert.equal(propertyReads,2);
});
test('incomplete or repeated long draft pages cannot become an approved email', async()=>{
 const p=page(); p.properties['Draft Email']={type:'rich_text',id:'draft',rich_text:Array.from({length:25},()=>({plain_text:'partial'}))};
 for (const part of [
  {results:[{type:'rich_text',rich_text:{plain_text:'Subject: Partial\nBody'}}]},
  {results:[{type:'rich_text',rich_text:{plain_text:'Subject: Repeated\nBody'}}],has_more:true,next_cursor:'same'},
  {results:[{type:'rich_text',rich_text:{}}],has_more:false},
 ]) {
  const adapter=createDirectNotionMailAdapter(config,async url=>Response.json(url.includes('/properties/')?part:p));
  await assert.rejects(adapter.email(`companies:${company}`),/incomplete/);
 }
});
test('host dispatch requires reconciled historic delivery and suppression before first lead release',()=>{
 const host={...env,HERMES_HISTORY_RECONCILED:undefined};
 assert.match(persistentMailDispatchBlock(host),/history|historical/i);
 assert.equal(persistentMailDispatchBlock({...host,HERMES_HISTORY_RECONCILED:'true'}),null);
 assert.equal(persistentMailHostBlock(host),null);
});
