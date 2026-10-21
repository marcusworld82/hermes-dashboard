import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { businessDefaults } from '../src/lib/server/business-settings.ts';
import { morningClock, runMorningWith, morningConfigCheck, legacyAutomation, senderConsentHash } from '../src/lib/server/morning-run.ts';
import { createMorningStore } from '../src/lib/server/morning-store.ts';
import { settingsHash } from '../src/lib/server/discovery.ts';
import { isPublicAddress, publicFeedUrl, parsePublicFeed, researchRssSources } from '../src/lib/server/morning-rss.ts';
import { runAutomationSteps } from '../src/lib/server/morning-worker.ts';
import { emailEventStage } from '../src/lib/server/morning-mail-events.ts';
const settings = {...businessDefaults, automaticMorningRun:true, services:'Websites',niche:'Local shops',location:'Atlanta'};
const monday = Date.parse('2026-10-19T11:00:00Z');
test('both schedules default off and New York schedule rotates without replay',()=>{
 assert.equal(businessDefaults.automaticMorningRun,false);assert.equal(businessDefaults.senderEnabled,false);
 assert.deepEqual(morningClock(monday),{day:'2026-10-19',due:true,kind:'side-hustle'});
 assert.equal(morningClock(monday+86400000).kind,'real-estate');
 assert.equal(morningClock(Date.parse('2026-10-25T11:00:00Z')).kind,null);
 assert.equal(morningClock(monday+3600000).due,false);
 assert.equal(morningClock(Date.parse('2026-11-02T12:00:00Z')).due,true);
});
test('off and missed morning run do no work or day claims',async()=>{
 const store=createMorningStore(':memory:');let calls=0;
 try{
  const common={store,now:monday,discovery:async()=>{calls++;},research:async()=>{calls++;}};
  await runMorningWith({...common,settings:{...settings,automaticMorningRun:false}});
  await runMorningWith({...common,settings,now:monday+3600000});assert.equal(calls,0);assert.equal(store.runs().length,0);
 }finally{store.close();}
});
test('durable day claim prevents duplicate paid work across clients and restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'morning-test-')),file=path.join(dir,'runs.sqlite');
 const first=createMorningStore(file),second=createMorningStore(file);let paid=0,rss=0;
 try{
  const common={settings,now:monday,discovery:async()=>{paid++;return {jobId:'fake'};},research:async()=>{rss++;}};
  await Promise.all([runMorningWith({...common,store:first}),runMorningWith({...common,store:second})]);
  assert.equal(paid,1);assert.equal(rss,1);assert.equal(first.runs()[0].steps.length,2);
  first.close();const next=createMorningStore(file);try{await runMorningWith({...common,store:next,now:monday+60000});assert.equal(paid,1);}finally{next.close();}
 }finally{second.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('independent morning failures still read RSS and Sunday never scrapes leads',async()=>{
 const store=createMorningStore(':memory:');let rss=0,paid=0;
 try{
  const common={settings,store,discovery:async()=>{paid++;throw Error('Fake token missing');},research:async()=>{rss++;return {items:[]};}};
  await runMorningWith({...common,now:monday});assert.equal(store.runs()[0].steps[0].status,'error');assert.equal(rss,1);
  await runMorningWith({...common,now:Date.parse('2026-10-25T11:00:00Z')});assert.equal(paid,1);assert.equal(rss,2);
 }finally{store.close();}
});
test('consent rejects changed cost and offer; sender limits are bound separately',()=>{
 const consent={at:monday,morningHash:settingsHash(settings),capUsd:settings.dailyScrapeCapUsd};
 morningConfigCheck(settings,consent);
 assert.throws(()=>morningConfigCheck({...settings,location:'Other'},consent),/changed/);
 assert.throws(()=>morningConfigCheck(settings,null),/changed/);
 assert.notEqual(senderConsentHash(settings),senderConsentHash({...settings,dailyEmailLimit:30}));
});
test('legacy CRM enabled switches block duplication without changing CRM data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-test-')),file=path.join(dir,'studio.db');
 const db=new DatabaseSync(file);db.exec("CREATE TABLE settings(k TEXT,v TEXT);INSERT INTO settings VALUES('ap_batch_on','1'),('ap_send_on','1'),('ap_paused','1')");db.close();
 try{assert.deepEqual(legacyAutomation(file),{batch:true,sender:true,error:null});const verify=new DatabaseSync(file,{readOnly:true});assert.equal(verify.prepare("SELECT v FROM settings WHERE k='ap_batch_on'").get().v,'1');verify.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('RSS refuses private, reserved and transition network destinations',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','100.64.0.1','192.0.2.1','198.18.0.1','203.0.113.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00::1'])assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://example.com/feed','https://user:pass@example.com/feed','https://example.com:8443/feed','https://127.0.0.1/feed','https://local.test/feed'])assert.throws(()=>publicFeedUrl(url));
});
test('RSS parses observed titles and dates, rejects entities and does no work for empty sources',async()=>{
 const source={id:'rss',type:'rss',value:'https://example.com/feed',enabled:true,notes:''};
 const xml='<rss><channel><item><title>Observed &amp; verified</title><link>https://example.com/story</link><pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 const items=parsePublicFeed(xml,source,monday);assert.equal(items.length,1);assert.equal(items[0].title,'Observed & verified');assert.equal(items[0].publishedAt,'2026-10-19T08:00:00.000Z');
 assert.throws(()=>parsePublicFeed('<!DOCTYPE x><rss/>',source),/XML/);
 let calls=0;const empty=await researchRssSources([],async()=>{calls++;return xml;});assert.equal(calls,0);assert.equal(empty.noSources,true);
 const result=await researchRssSources([source,{...source,id:'youtube',type:'youtube'}],async()=>xml,monday);assert.equal(result.items.length,1);assert.equal(result.sources[1].status,'skipped');
});
test('automation tick continues sender and event sync after morning failure',async()=>{
 const ran=[];const result=await runAutomationSteps({morning:async()=>{throw Error('fake');},sender:async()=>{ran.push('sender');},events:async()=>{ran.push('events');}});
 assert.equal(result.results[0].ok,false);assert.deepEqual(ran,['sender','events']);
});
test('Notion delivery events preserve human edits and protected stages',()=>{
 const item={revision:'approved'};
 assert.equal(emailEventStage('sent','New','approved',item,false),'Sent');
 assert.equal(emailEventStage('sent','New','human-edit',item,false),null);
 assert.equal(emailEventStage('replied','Sent','changed-after-send',item,true),'Replied');
 assert.equal(emailEventStage('bounced','Sent','changed-after-send',item,true),'Paused');
 for(const stage of ['Denied','Do not contact','Meeting','Client','Paused'])assert.equal(emailEventStage('replied',stage,'approved',item,true),null);
});
test('cross-worker alert claim is atomic and cannot be consumed twice',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notice-test-')),file=path.join(dir,'runs.sqlite');const a=createMorningStore(file),b=createMorningStore(file);
 try{assert.equal(a.claimOnce('telegram:notice-1'),true);assert.equal(b.claimOnce('telegram:notice-1'),false);}finally{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Telegram destination needs explicit saved approval, and changed destination disables it',async()=>{
 const {telegramAlertStatus}=await import('../src/lib/server/morning-telegram.ts');const store=createMorningStore(':memory:');
 const oldToken=process.env.TELEGRAM_BOT_TOKEN,oldChat=process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID;
 try{
  process.env.TELEGRAM_BOT_TOKEN='fake-test-token';process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID='123456789';
  assert.equal(telegramAlertStatus(store).enabled,false);
  store.set('telegram-approval',{enabled:true,destination:'123456789',at:1});assert.equal(telegramAlertStatus(store).enabled,true);
  process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID='987654321';assert.equal(telegramAlertStatus(store).enabled,false);
 }finally{store.close();if(oldToken===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=oldToken;if(oldChat===undefined)delete process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID;else process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID=oldChat;}
});
