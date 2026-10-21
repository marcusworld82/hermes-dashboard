import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteMailStore, mailStorageBlock } from '../src/lib/server/mail-queue-store.ts';
import { exactEmailDraft, approveEmail, reserveEmail, sendingWindow, suppressEmail, setQueuePaused, OPT_OUT } from '../src/lib/server/mail-queue.ts';
import { encryptGmailSecret, decryptGmailSecret } from '../src/lib/server/gmail-crypto.ts';
import { beginGmailOAuth, consumeOAuthState } from '../src/lib/server/gmail-oauth.ts';
import { classifyInbound, pollGmailInbox } from '../src/lib/server/gmail-inbox.ts';
import { sendGmailSelfTest, verifyGmailSelfTest, releaseGmailQueue } from '../src/lib/server/gmail-sender.ts';
import { rawEmail } from '../src/lib/server/gmail-api.ts';
const settings = { dailyEmailLimit:20, weekendSending:false, senderName:'Test Owner', businessName:'Test Business', postalAddress:'123 Test Road' };
const lead = { id:'lead-1', email:'person@example.com', stage:'New', doNotContact:false, subject:'A test subject', body:'Test draft', revision:'one' };
const monday = Date.parse('2026-10-19T14:00:00Z');
const key = crypto.randomBytes(32).toString('base64');
process.env.GMAIL_TOKEN_ENCRYPTION_KEY = key;
function storeReady(file=':memory:', now=monday) {
 const store=createSqliteMailStore(file);
 store.transaction(state=> { state.account={email:'self@example.com', encryptedTokens:encryptGmailSecret({accessToken:'fake',refreshToken:'fake-refresh',expiresAt:Date.now()+3600000}),connectedAt:now-1000,historyId:'1',lastPollAt:now}; state.test={account:'self@example.com',messageId:'<self>',requestedAt:now-1000,verifiedAt:now};state.paused=false; });
 return store;
}
function approve(store,l=lead,now=monday,kind='first') { return approveEmail(store,l,settings,exactEmailDraft(l,settings).draftHash,kind,now); }
test('encrypted tokens authenticate ciphertext and reject wrong keys',()=>{
 const encrypted=encryptGmailSecret({refresh:'private-token'},key);
 assert.ok(!encrypted.includes('private-token')); assert.deepEqual(decryptGmailSecret(encrypted,key),{refresh:'private-token'});
 assert.throws(()=>decryptGmailSecret(encrypted,crypto.randomBytes(32).toString('base64')),/could not be decrypted/);
 const pieces=encrypted.split('.'); pieces[3]=(pieces[3][0]==='a'?'b':'a')+pieces[3].slice(1);
 assert.throws(()=>decryptGmailSecret(pieces.join('.'),key),/could not be decrypted/);
});
test('cloud refuses filesystem queue even if credentials exist',()=>{
 assert.match(mailStorageBlock({VERCEL:'1'}),/shared durable database/); assert.equal(mailStorageBlock({}),null);
});
test('OAuth state is browser bound, expiring and single use',()=>{
 process.env.GMAIL_CLIENT_ID='fake-client';process.env.GMAIL_CLIENT_SECRET='fake-secret';process.env.GMAIL_REDIRECT_URI='http://localhost:3200/api/gmail/callback';
 const store=storeReady(); try {
  const flow=beginGmailOAuth(store,monday);const url=new URL(flow.url),state=url.searchParams.get('state');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.throws(()=>consumeOAuthState(store,state,'wrong',monday),/did not match/);
  assert.throws(()=>consumeOAuthState(store,state,flow.browser,monday+600001),/expired/);
  assert.ok(consumeOAuthState(store,state,flow.browser,monday));
  assert.throws(()=>consumeOAuthState(store,state,flow.browser,monday),/expired/);
 }finally{store.close();}
});
test('exact approval includes footer and rejects draft or address edits',()=>{
 const store=storeReady(); try {
  const preview=exactEmailDraft(lead,settings);assert.match(preview.body,/123 Test Road/);assert.ok(preview.body.includes(OPT_OUT));
  assert.throws(()=>approveEmail(store,{...lead,body:'changed'},settings,preview.draftHash,'first',monday),/draft changed/);
  assert.throws(()=>approveEmail(store,lead,{...settings,postalAddress:'different'},preview.draftHash,'first',monday),/draft changed/);
  assert.throws(()=>approve(store,{...lead,stage:'Denied'}),/denied/);
  assert.throws(()=>approve(store,{...lead,doNotContact:true}),/Do not contact/);
  const item=approve(store);assert.equal(item.body,preview.body);
  assert.throws(()=>approve(store,{...lead,id:'duplicate'}),/already has/);
  assert.throws(()=>approve(store,{...lead,email:'new@example.com'}),/already has/);
 }finally{store.close();}
});
test('self-test is required before approval and resume',()=>{
 const store=createSqliteMailStore(':memory:');try{
  assert.throws(()=>approve(store),/test to your own inbox/);assert.throws(()=>setQueuePaused(store,false),/self-test/);
 }finally{store.close();}
});
test('sending window uses New York clock across DST and weekends',()=>{
 assert.equal(sendingWindow(Date.parse('2026-10-19T12:59:59Z'),false).allowed,false);
 assert.equal(sendingWindow(Date.parse('2026-10-19T13:00:00Z'),false).allowed,true);
 assert.equal(sendingWindow(Date.parse('2026-10-20T01:00:00Z'),false).allowed,false);
 assert.equal(sendingWindow(Date.parse('2026-11-02T13:30:00Z'),false).allowed,false);
 assert.equal(sendingWindow(Date.parse('2026-11-02T14:00:00Z'),false).allowed,true);
 assert.equal(sendingWindow(Date.parse('2026-10-24T15:00:00Z'),false).allowed,false);
 assert.equal(sendingWindow(Date.parse('2026-10-24T15:00:00Z'),true).allowed,true);
});
test('two DB clients cannot claim two sends, and crash reservation survives reopen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-mail-test-'));const file=path.join(dir,'queue.sqlite');
 const first=storeReady(file),second=createSqliteMailStore(file);
 try{
  approve(first);approve(first,{...lead,id:'lead-2',email:'second@example.com'});
  assert.ok(reserveEmail(first,settings,monday,0).item);
  assert.equal(reserveEmail(second,settings,monday).item,null);
  assert.ok(first.read().nextReleaseAt>=monday+13*60000);
  first.close();const reopened=createSqliteMailStore(file);
  try { reopened.transaction(s=>{s.account.lastPollAt=monday+3600000;});assert.match(reserveEmail(reopened,settings,monday+3600000).block,/reconciliation/); }finally{reopened.close();}
 }finally{second.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('daily limit, recent replies and bounce threshold block release',()=>{
 const store=storeReady();try{
  const item=approve(store);store.transaction(s=>{const row=s.items[0];row.status='sent';row.sentAt=monday;row.attemptedAt=monday;});
  approve(store,{...lead,id:'next',email:'next@example.com'});
  assert.match(reserveEmail(store,{...settings,dailyEmailLimit:1},monday).block,/Daily/);
  suppressEmail(store,item.email,'Bounced',monday);assert.equal(store.read().paused,true);assert.match(store.read().pauseReason,/3 percent/);
  suppressEmail(store,'next@example.com','Not interested',monday);assert.equal(store.read().items[1].status,'cancelled');
  assert.throws(()=>approve(store,{...lead,id:'next',email:'next@example.com'}),/suppressed/);
 }finally{store.close();}
});
test('follow-up requires separate approval and waits four days',()=>{
 const store=storeReady();try{
  assert.throws(()=>approve(store,lead,monday,'followup'),/confirmed first/);
  approve(store);store.transaction(s=>{s.items[0].status='sent';s.items[0].sentAt=monday;});
  const follow=approve(store,{...lead,body:'A distinct followup',revision:'two'},monday,'followup');
  assert.equal(follow.notBefore,monday+4*86400000);assert.equal(reserveEmail(store,settings,monday).item,null);
  assert.throws(()=>approve(store,lead,monday,'followup'),/already has/);
 }finally{store.close();}
});
test('replies, DSN bounces and abuse feedback stop only matching contacts',()=>{
 const tracked=[{email:lead.email,threadId:'thread',messageId:'<original>'}];
 const message={id:'reply',threadId:'thread',payload:{headers:[{name:'From',value:'Person <person@example.com>'}],body:{data:Buffer.from('No thanks').toString('base64url')}}};
 assert.equal(classifyInbound(message,'self@example.com',tracked)[0].reason,'Not interested');
 const dsn={id:'dsn',payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.com'}],body:{data:Buffer.from('Final-Recipient: rfc822; person@example.com\nAction: failed').toString('base64url')}}};
 assert.equal(classifyInbound(dsn,'self@example.com',tracked)[0].reason,'Bounced');
 const spam={...dsn,payload:{...dsn.payload,body:{data:Buffer.from('Feedback-Type: abuse\nOriginal-Rcpt-To: person@example.com\n').toString('base64url')}}};
 assert.equal(classifyInbound(spam,'self@example.com',tracked)[0].reason,'Spam complaint');
 assert.deepEqual(classifyInbound({...message,labelIds:['SENT']},'self@example.com',tracked),[]);
});
test('test send always targets authenticated account and inbox proof gates verification',async()=>{
 const store=storeReady(':memory:',Date.now()-120000);store.transaction(s=>{delete s.test;});let raw;
 try{
  await sendGmailSelfTest(store,async(url,options)=>{raw=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();return Response.json({id:'self-message'});});
  assert.match(raw,/To: self@example.com/);assert.ok(!raw.includes(lead.email));
  const id=store.read().test.messageId;
  const metadata={id:'self-message',labelIds:['SENT'],payload:{headers:[{name:'To',value:'self@example.com'},{name:'Message-ID',value:id}]}};
  await assert.rejects(verifyGmailSelfTest(store,async()=>Response.json(metadata)),/not been verified/);
  await verifyGmailSelfTest(store,async()=>Response.json({...metadata,labelIds:['INBOX','SENT']}));assert.ok(store.read().test.verifiedAt);
 }finally{store.close();}
});
test('inbox failure blocks send, and missing reply cursor recovers before advancing',async()=>{
 const store=storeReady();try{
  await assert.rejects(pollGmailInbox(store,async()=>new Response('',{status:401})),/HTTP 401/);assert.ok(store.read().account.pollError);
  let calls=0;
  await pollGmailInbox(store,async(url)=>{calls++;if(url.includes('/history?'))return new Response('',{status:404});if(url.endsWith('/profile'))return Response.json({historyId:'new'});return Response.json({messages:[]});});
  assert.equal(calls,3);assert.equal(store.read().account.historyId,'new');assert.equal(store.read().account.pollError,undefined);
 }finally{store.close();}
});
test('unsafe email headers are rejected',()=>{
 assert.throws(()=>rawEmail({from:'self@example.com',to:'person@example.com\r\nBcc: thief@example.com',subject:'x',body:'x',messageId:'<x>'}),/valid public/);
});
test('final draft recheck cancels changed approval before any send request',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:monday});const store=storeReady();let sends=0;
 try{
  approve(store);
  const result=await releaseGmailQueue(store,settings,()=>({...lead,body:'changed'}),async(url)=>{if(url.includes('/messages/send'))sends++;return Response.json({historyId:'2',history:[]});});
  assert.equal(result.sent,false);assert.equal(sends,0);assert.equal(store.read().items[0].status,'cancelled');
 }finally{store.close();t.mock.timers.reset();}
});
test('uncertain network send pauses durable queue and cannot retry',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:monday});const store=storeReady();let sends=0;
 const fetcher=async(url)=>{if(url.includes('/messages/send')){sends++;throw Error('network timeout');}return Response.json({historyId:'2',history:[]});};
 try{
  approve(store);assert.equal((await releaseGmailQueue(store,settings,()=>lead,fetcher)).sent,false);
  assert.equal(sends,1);assert.equal(store.read().items[0].status,'unknown');assert.equal(store.read().paused,true);
  assert.throws(()=>setQueuePaused(store,false),/uncertain/);
  t.mock.timers.tick(1200000);await releaseGmailQueue(store,settings,()=>lead,fetcher);assert.equal(sends,1);
 }finally{store.close();t.mock.timers.reset();}
});
test('successful release sends exact approved bytes once and measures gap from receipt',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:monday});const store=storeReady();let sends=0;
 try{
  const approved=approve(store);
  await releaseGmailQueue(store,settings,()=>lead,async(url,options)=>{
   if(!url.includes('/messages/send'))return Response.json({historyId:'2',history:[]});
   sends++;const raw=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();
   const body=Buffer.from(raw.split('\r\n\r\n')[1].replaceAll('\r\n',''),'base64').toString();assert.equal(body,approved.body);
   t.mock.timers.tick(90000);return Response.json({id:'sent-1',threadId:'thread-1'});
  });
  assert.equal(sends,1);assert.equal(store.read().items[0].status,'sent');assert.ok(store.read().nextReleaseAt>=Date.now()+13*60000);
 }finally{store.close();t.mock.timers.reset();}
});
test('externally marked Sent lead cannot receive a first email',()=>{
 const store=storeReady();try{assert.throws(()=>approve(store,{...lead,stage:'Sent'}),/already marked Sent/);}finally{store.close();}
});
test('standing sender permission is rechecked after slow lead lookup',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:monday});const store=storeReady();let enabled=true,sends=0;
 try{
  approve(store);
  const result=await releaseGmailQueue(store,settings,()=>{enabled=false;return lead;},async(url)=>{if(url.includes('/messages/send'))sends++;return Response.json({historyId:'2',history:[]});},()=>enabled?null:'Turned off');
  assert.equal(result.sent,false);assert.equal(sends,0);
 }finally{store.close();t.mock.timers.reset();}
});
