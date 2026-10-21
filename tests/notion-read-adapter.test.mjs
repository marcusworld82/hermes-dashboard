import test from 'node:test';
import assert from 'node:assert/strict';
import { readNotionResearchDirect, normalizeNotionResearchPage, LEAD_NOTION_SOURCES } from '../src/lib/server/notion-read-adapter.ts';
import { mapLeadResearch, createLeadResearchRefresher } from '../src/lib/server/lead-research.ts';
const id = '123456781234123412341234567890ab';
const prop = (type, value, extra = {}) => ({ type, [type]: value, ...extra });
const text = value => ({ plain_text: value });
const page = () => ({ object:'page', id, parent:{data_source_id:LEAD_NOTION_SOURCES.companies}, created_time:'2026-10-20T00:00:00Z',last_edited_time:'2026-10-20T01:00:00Z', properties:{ Name:prop('title',[text('Mock '),text('Company')]), 'Draft Email':prop('rich_text',[text('Subject: Hello\n'),text('Exact body')]), 'Priority Score':prop('number',0), 'Why Tags':prop('multi_select',[{name:'Website'}]), 'First Found':prop('date',{start:'2026-10-20'}), Stage:prop('select',{name:'New'}), People:prop('relation',[]), 'Cost USD':prop('number',null) } });
const list = (results = [], cursor = null) => ({object:'list',results,has_more:cursor !== null,next_cursor:cursor});
const response = data => new Response(JSON.stringify(data),{status:200});
test('normalization preserves exact text, zero, null, dates and tags for existing mapper',async()=>{
 const row = normalizeNotionResearchPage(page());
 assert.equal(row['Draft Email'],'Subject: Hello\nExact body'); assert.equal(row['Priority Score'],0); assert.equal(row['Cost USD'],null);
 const snapshot = await readNotionResearchDirect({token:'mock-token',fetcher:async(url,init)=>{
  assert.equal(new URL(url).origin,'https://api.notion.com'); assert.equal(init.redirect,'error'); assert.equal(init.headers['Notion-Version'],'2026-03-11');
  assert.equal(init.method,'POST'); assert.equal(init.headers.Authorization,'Bearer mock-token');
  return response(list(url.includes(LEAD_NOTION_SOURCES.companies)?[page()]:[]));
 }});
 const company = mapLeadResearch(snapshot).companies[0];
 assert.equal(company.name,'Mock Company'); assert.equal(company.score,0); assert.equal(company.dateAdded,'2026-10-20'); assert.deepEqual(company.tags,['Website']); assert.equal(company.drafts.email,'Subject: Hello\nExact body');
});
test('paginates source and full relation and long text property results',async()=>{
 const p=page(); p.properties.People=prop('relation',[{id}],{id:'rel',has_more:true}); p.properties['Draft Email']=prop('rich_text',Array.from({length:25},()=>text('partial')),{id:'draft'});
 const calls=[];
 const result=await readNotionResearchDirect({token:'mock',fetcher:async(url,init)=>{
  calls.push(url); const u=new URL(url);
  if(u.pathname.includes('/properties/rel')) return response(u.searchParams.has('start_cursor')?list([{type:'relation',relation:{id:'abcdefab1234123412341234567890ab'}}]):list([{type:'relation',relation:{id}}],'relation-next'));
  if(u.pathname.includes('/properties/draft')) return response(list([{type:'rich_text',rich_text:text('Subject: complete\nBody')} ]));
  if(url.includes(LEAD_NOTION_SOURCES.companies)) return response(JSON.parse(init.body).start_cursor?list():list([p],'source-next'));
  return response(list());
 }});
 assert.equal(result.companies[0].People.length,2); assert.equal(result.companies[0]['Draft Email'],'Subject: complete\nBody'); assert.equal(calls.length,9);
});
test('fails closed for missing token, duplicate pages, repeated cursor, foreign parent and incomplete relations',async()=>{
 let calls=0; await assert.rejects(readNotionResearchDirect({token:'',fetcher:async()=>{calls++;}}),/unconfigured/); assert.equal(calls,0);
 for(const data of [list([page(),page()]),list([{...page(),parent:{data_source_id:LEAD_NOTION_SOURCES.people}}]),{object:'list',results:[],has_more:true,next_cursor:null}]) await assert.rejects(readNotionResearchDirect({token:'mock',fetcher:async()=>response(data)}));
 await assert.rejects(readNotionResearchDirect({token:'mock',fetcher:async()=>response(list([],'repeated'))}),/pagination/);
 const p=page(); p.properties.People.has_more=true; await assert.rejects(readNotionResearchDirect({token:'mock',fetcher:async()=>response(list([p]))}),/property/);
});
test('HTTP failures do not leak response bodies and retain cache with retry throttle',async()=>{
 let calls=0; let state={...mapLeadResearch({ok:true,companies:[normalizeNotionResearchPage(page())],people:[],opportunities:[],evidence:[],runLog:[]}),checkedAt:'2026-10-19T00:00:00Z',attemptedAt:null,error:null};
 const run=()=>readNotionResearchDirect({token:'secret-test',fetcher:async()=>{calls++;return new Response('sensitive error details',{status:403});}});
 await assert.rejects(run(),error=>error.message==='notion_host_read_failed'); calls=0;
 const refresh=createLeadResearchRefresher({read:()=>state,write:value=>{state=value;},run,now:()=>Date.parse('2026-10-20T00:00:00Z')});
 await refresh(); assert.equal(state.companies.length,1); assert.equal(state.checkedAt,'2026-10-19T00:00:00Z'); assert.ok(!state.error.includes('sensitive')); assert.equal((await refresh()).skipped,true); assert.equal(calls,1);
 await assert.rejects(readNotionResearchDirect({token:'mock',fetcher:async()=>new Response('',{status:429})}),/rate_limited/);
});
test('failure in a later source rejects the whole snapshot',async()=>{
 let calls=0;
 await assert.rejects(readNotionResearchDirect({token:'mock',fetcher:async()=>{
  calls++; if(calls===3) return new Response('private upstream details',{status:500});
  return response(list(calls===1?[page()]:[]));
 }}),/notion_host_read_failed/);
 assert.equal(calls,3);
});
