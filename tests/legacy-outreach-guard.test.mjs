import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {legacyOutreachBlock,loadLegacyOutreachHistory} from '../src/lib/server/legacy-outreach-guard.ts';
const lead={email:'new@example.com',phone:'+1 (216) 555-1234',website:'https://www.example.com/offer'};
const row=(patch={})=>({email:'old@example.com',phone:'2165551234',links:[{label:'Website',url:'https://example.com'}],stage:'To review',status:'new',drafts:[],messages:[],...patch});
const history=(rows)=>({prospects:rows,suppressedEmails:[],checkedAt:Date.now()});
test('DNC blocks by domain, normalized phone or email regardless of new contact address',()=>{
 assert.match(legacyOutreachBlock(lead,'first',history([row({doNotContact:true})])),/suppressed/);
 assert.match(legacyOutreachBlock({email:'OLD@EXAMPLE.COM'},'followup',history([row({stage:'Denied'})])),/suppressed/);
 assert.match(legacyOutreachBlock({phone:'+12165551234'},'first',history([row({stage:'Archived'})])),/suppressed/);
 assert.match(legacyOutreachBlock(lead,'first',{...history([]),suppressedEmails:['NEW@example.com']}),/permanently/);
});
test('prior relationship and any inbound messages stop first and followup',()=>{
 for(const stage of ['Replied','Meeting','Client','Closed'])for(const kind of ['first','followup'])assert.ok(legacyOutreachBlock(lead,kind,history([row({stage})])));
 for(const direction of ['in','incoming'])assert.match(legacyOutreachBlock(lead,'followup',history([row({messages:[{direction}]})])),/reply/);
});
test('prior outbound, sent or queued draft blocks second first and unreviewed sequence migration',()=>{
 for(const patch of [{stage:'Contacted'},{stage:'Sent'},{messages:[{direction:'outgoing'}]},{drafts:[{status:'sent'}]},{drafts:[{status:'queued'}]},{drafts:[{status:'draft',sent_at:'2026-10-20'}]}]){
  assert.match(legacyOutreachBlock(lead,'first',history([row(patch)])),/second first/);
  assert.match(legacyOutreachBlock(lead,'followup',history([row(patch)])),/reconciled/);
 }
});
test('unknown history fails closed; clean unrelated and unsent records pass',()=>{
 assert.match(legacyOutreachBlock(lead,'first',history([row({drafts:undefined})])),/incomplete/);
 assert.match(legacyOutreachBlock(lead,'first',history([row({messages:[{direction:'mystery'}]})])),/unknown/);
 assert.match(legacyOutreachBlock(lead,'first',{...history([]),checkedAt:1}),/stale/);
 assert.equal(legacyOutreachBlock(lead,'first',history([row({drafts:[{status:'draft'}]})])),null);
 assert.equal(legacyOutreachBlock({email:'different@elsewhere.test',website:'https://elsewhere.test'},'first',history([row({doNotContact:true})])),null);
});
test('shared platform domains do not merge unrelated businesses',()=>{
 assert.equal(legacyOutreachBlock({website:'https://instagram.com/one'},'first',history([row({phone:'',email:'',links:[{label:'Website',url:'https://instagram.com/two'}],doNotContact:true})])),null);
});
test('loader requires readable current caches and live SQLite, including global suppression',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-guard-'));const crm=path.join(root,'crm'),data=path.join(root,'cache');fs.mkdirSync(path.join(crm,'data/notion-migration'),{recursive:true});fs.mkdirSync(data);
 const now=Date.now();const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
 const opts={crmDir:crm,data,now,readLibrary:()=>({mode:'local_live',prospects:[row()]})};
 try{
  assert.throws(()=>loadLegacyOutreachHistory(opts),/missing or unreadable/);
  write(path.join(crm,'data/notion-migration/receipt.json'),{pages:[]});write(path.join(data,'notion-prospect-live.json'),{checkedAt:new Date(now).toISOString(),pages:[]});write(path.join(data,'bigin-prospect-sync.json'),{checkedAt:new Date(now).toISOString(),mappings:[]});
  assert.throws(()=>loadLegacyOutreachHistory(opts),/Live legacy/);
  const db=new DatabaseSync(path.join(crm,'data/studio.db'));db.exec('CREATE TABLE suppression(email TEXT)');db.prepare('INSERT INTO suppression VALUES (?)').run('blocked@example.com');db.close();
  assert.deepEqual(loadLegacyOutreachHistory(opts).suppressedEmails,['blocked@example.com']);
  assert.throws(()=>loadLegacyOutreachHistory({...opts,readLibrary:()=>({mode:'import_snapshot',prospects:[]})}),/import snapshot/);
  write(path.join(data,'notion-prospect-live.json'),{checkedAt:'2020-01-01',pages:[]});assert.throws(()=>loadLegacyOutreachHistory(opts),/stale/);
  fs.writeFileSync(path.join(data,'notion-prospect-live.json'),'not json');assert.throws(()=>loadLegacyOutreachHistory(opts),/unreadable/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
