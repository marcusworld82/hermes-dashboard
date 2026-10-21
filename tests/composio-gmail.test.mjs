import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSqliteMailStore } from '../src/lib/server/mail-queue-store.ts';
import { beginComposioGmail, finishComposioGmail } from '../src/lib/server/composio-gmail.ts';
import { accessToken, gmailRequest, GmailHttpError } from '../src/lib/server/gmail-api.ts';
process.env.GMAIL_TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
process.env.COMPOSIO_API_KEY='test-private-key';
process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID='ac_gmail';
process.env.COMPOSIO_USER_ID='marcus-os';
process.env.COMPOSIO_CALLBACK_URL='http://localhost:3200/api/gmail/composio/callback';
const json=(value,status=200)=>Response.json(value,{status});
function fake(options={}) { const calls=[]; return {calls,fetch:async(url,init={})=>{ calls.push({url,init,body:init.body?JSON.parse(init.body):null});
 if(url.endsWith('/link')) return json({redirect_url:'https://connect.composio.dev/link/test',connected_account_id:'ca_bound'});
 if(url.endsWith('/ca_bound'))return json({id:'ca_bound',status:'ACTIVE',user_id:'marcus-os',toolkit:{slug:'gmail'},auth_config:{id:'ac_gmail',is_disabled:false},...options.account});
 const body=JSON.parse(init.body);if(body.endpoint.endsWith('/profile'))return json({status:200,data:{emailAddress:'SELF@example.com',historyId:'100'}});
 return json({status:options.status||200,data:{id:'message-1'}});
 }}; }
test('Connect Link binds account, browser and callback state; reconnect clears previous test',async()=>{const store=createSqliteMailStore(':memory:');try{
 const f=fake(); const flow=await beginComposioGmail(store,f.fetch);const callback=new URL(f.calls[0].body.callback_url);assert.equal(f.calls[0].body.user_id,'marcus-os');assert.equal(f.calls[0].body.auth_config_id,'ac_gmail');
 assert.equal(f.calls[0].init.headers['x-api-key'],'test-private-key');assert.equal(flow.url,'https://connect.composio.dev/link/test');assert.ok(!JSON.stringify(flow).includes('test-private-key'));
 await assert.rejects(finishComposioGmail(store,callback.searchParams.get('state'),'wrong',f.fetch),/state/);
 store.transaction(s=>{s.test={account:'old@example.com',messageId:'test',requestedAt:1,verifiedAt:2};s.items.push({id:'queued',status:'queued'});});
 const result=await finishComposioGmail(store,callback.searchParams.get('state'),flow.browser,f.fetch);assert.equal(result.email,'self@example.com');assert.equal(store.read().account.connectedAccountId,'ca_bound');assert.equal(store.read().test,undefined);assert.equal(store.read().items[0].status,'cancelled');assert.equal(store.read().paused,true);
 await assert.rejects(finishComposioGmail(store,callback.searchParams.get('state'),flow.browser,f.fetch),/state/);
 }finally{store.close();}});
test('inactive, foreign-user and wrong-toolkit accounts fail closed',async()=>{for(const account of [{status:'INACTIVE'},{user_id:'attacker'},{toolkit:{slug:'github'}},{auth_config:{id:'ac_wrong'}},{id:'ca_swapped'}]){const store=createSqliteMailStore(':memory:');try{const f=fake({account});const flow=await beginComposioGmail(store,f.fetch);const state=new URL(f.calls[0].body.callback_url).searchParams.get('state');await assert.rejects(finishComposioGmail(store,state,flow.browser,f.fetch),/account/);assert.equal(store.read().account,undefined);}finally{store.close();}}});
test('expired flow cannot attach account',async()=>{const store=createSqliteMailStore(':memory:');try{const f=fake();const flow=await beginComposioGmail(store,f.fetch,1);const state=new URL(f.calls[0].body.callback_url).searchParams.get('state');await assert.rejects(finishComposioGmail(store,state,flow.browser,f.fetch),/state/);assert.equal(f.calls.length,1);}finally{store.close();}});
test('proxy keeps exact raw body and query params, preserves upstream HTTP status with no retries',async()=>{const store=createSqliteMailStore(':memory:');try{store.transaction(s=>{s.account={provider:'composio',connectedAccountId:'ca_bound',email:'self@example.com',historyId:'1',lastPollAt:0,connectedAt:1};});const f=fake();const token=await accessToken(store,f.fetch);assert.deepEqual(await gmailRequest(token,'messages/send',{method:'POST',body:JSON.stringify({raw:'exact-raw',threadId:'thread-1'})},f.fetch),{id:'message-1'});assert.deepEqual(f.calls[0].body.body,{raw:'exact-raw',threadId:'thread-1'});assert.equal(f.calls[0].body.connected_account_id,'ca_bound');assert.equal(f.calls[0].body.user_id,'marcus-os');
 const missing=fake({status:404});await assert.rejects(gmailRequest(token,'history?startHistoryId=1&historyTypes=messageAdded',{},missing.fetch),e=>e instanceof GmailHttpError&&e.status===404);assert.equal(missing.calls.length,1);assert.ok(missing.calls[0].body.endpoint.endsWith('history?startHistoryId=1&historyTypes=messageAdded'));
 }finally{store.close();}});

test('Composio self-test requires full inbox read, and missing scope blocks verification',async()=>{
 const {sendGmailSelfTest,verifyGmailSelfTest}=await import('../src/lib/server/gmail-sender.ts');
 const store=createSqliteMailStore(':memory:');try{
 store.transaction(s=>{s.account={provider:'composio',connectedAccountId:'ca_bound',email:'self@example.com',historyId:'1',lastPollAt:0,connectedAt:1};});
 let sends=0;const fetcher=async(url,init)=>{const input=JSON.parse(init.body);if(input.method==='POST'){sends++;const raw=Buffer.from(input.body.raw,'base64url').toString();assert.match(raw,/To: self@example.com/);return json({status:200,data:{id:'self-message'}});}assert.ok(input.endpoint.includes('format=full'));return json({status:403,data:{error:'insufficientPermissions'}});};
 await sendGmailSelfTest(store,fetcher);await assert.rejects(verifyGmailSelfTest(store,fetcher),e=>e instanceof GmailHttpError&&e.status===403);assert.equal(sends,1);assert.equal(store.read().test.verifiedAt,undefined);assert.equal(store.read().paused,true);
 }finally{store.close();}
});

test('Composio expired cursor recovers, while denied reply reads block sending',async()=>{
 const {pollGmailInbox}=await import('../src/lib/server/gmail-inbox.ts');const {releaseGmailQueue}=await import('../src/lib/server/gmail-sender.ts');
 const store=createSqliteMailStore(':memory:');try{
 store.transaction(s=>{s.account={provider:'composio',connectedAccountId:'ca_bound',email:'self@example.com',historyId:'1',lastPollAt:Date.now(),connectedAt:1};});
 let calls=0;await pollGmailInbox(store,async(url,init)=>{calls++;const input=JSON.parse(init.body);if(input.endpoint.includes('/history?'))return json({status:404,data:{}});if(input.endpoint.endsWith('/profile'))return json({status:200,data:{historyId:'2'}});return json({status:200,data:{messages:[]}});});assert.equal(calls,3);assert.equal(store.read().account.historyId,'2');
 let sends=0;await assert.rejects(releaseGmailQueue(store,{},()=>({}),async(url,init)=>{if(JSON.parse(init.body).method==='POST')sends++;return json({status:403,data:{}});}),/HTTP 403/);assert.equal(sends,0);assert.ok(store.read().account.pollError);
 }finally{store.close();}
});

test('Composio timeout leaves send unknown and never automatically resends',async(t)=>{
 const {releaseGmailQueue}=await import('../src/lib/server/gmail-sender.ts');const {approveEmail,exactEmailDraft}=await import('../src/lib/server/mail-queue.ts');
 const now=Date.parse('2026-10-19T14:00:00Z');t.mock.timers.enable({apis:['Date'],now});const store=createSqliteMailStore(':memory:');let sends=0;
 const settings={dailyEmailLimit:20,weekendSending:false,senderName:'Owner',businessName:'Business',postalAddress:'123 Test Road'};const lead={id:'lead-1',email:'person@example.com',stage:'New',doNotContact:false,subject:'Test',body:'Exact body',revision:'one'};
 const fetcher=async(url,init)=>{const input=JSON.parse(init.body);if(input.method==='POST'){sends++;throw Error('timeout');}return json({status:200,data:{historyId:'2',history:[]}});};
 try{store.transaction(s=>{s.account={provider:'composio',connectedAccountId:'ca_bound',email:'self@example.com',historyId:'1',lastPollAt:now,connectedAt:now-1000};s.test={account:'self@example.com',messageId:'self',requestedAt:now-1000,verifiedAt:now};s.paused=false;});
 approveEmail(store,lead,settings,exactEmailDraft(lead,settings).draftHash,'first',now);await releaseGmailQueue(store,settings,()=>lead,fetcher);assert.equal(store.read().items[0].status,'unknown');assert.equal(store.read().paused,true);t.mock.timers.tick(1200000);await releaseGmailQueue(store,settings,()=>lead,fetcher);assert.equal(sends,1);
 }finally{store.close();t.mock.timers.reset();}
});


test('Connect Link rejects unknown redirect hosts',async()=>{const store=createSqliteMailStore(':memory:');try{await assert.rejects(beginComposioGmail(store,async()=>json({redirect_url:'https://composio.dev.attacker.example/signin',connected_account_id:'ca_bound'})),/sign-in link/);assert.equal(store.read().composioOAuth,undefined);}finally{store.close();}});
