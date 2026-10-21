import test from 'node:test';
import assert from 'node:assert/strict';
import { previewBulkEmail, approveBulkEmail } from '../src/lib/server/bulk-email.ts';
import { emptyMailState } from '../src/lib/server/mail-queue-store.ts';
const settings = {dailyEmailLimit:20,weekendSending:false,senderName:'Owner',businessName:'Business',postalAddress:'123 Test Road'};
const ids = ['companies:'+ 'a'.repeat(32), 'people:'+ 'b'.repeat(32)];
function setup() {
 let state=emptyMailState();
 state.account={email:'self@example.com',encryptedTokens:'unused',connectedAt:1,historyId:'1',lastPollAt:1};
 state.test={account:'self@example.com',requestedAt:1,messageId:'test',verifiedAt:1};
 const store={read:()=>structuredClone(state),close(){},transaction(fn){const next=structuredClone(state);const result=fn(next);state=next;return result;}};
 const leads=Object.fromEntries(ids.map((id,i)=>[id,{id,email:`test${i}@example.com`,stage:'New',doNotContact:false,subject:'Subject',body:'Complete draft',revision:'one'}]));
 const resolver=id=>structuredClone(leads[id]);
 return {store,leads,resolver};
}
const approvals=rows=>rows.filter(row=>!row.error).map(row=>({id:row.id,kind:row.kind,approvedHash:row.draftHash}));
test('preview is complete, uses exact queue checks, and never mutates queue',async()=>{
 const {store,resolver}=setup(); const {rows}=await previewBulkEmail(store,resolver,settings,ids);
 assert.equal(rows.length,2);assert.match(rows[0].body,/Complete draft\n\nOwner\nBusiness\n123 Test Road/);assert.match(rows[0].body,/no thanks/);assert.equal(store.read().items.length,0);
 const result=await approveBulkEmail(store,resolver,settings,approvals(rows),true);
 assert.equal(result.queued,2);assert.equal(store.read().paused,true);assert.ok(store.read().items.every(item=>item.status==='queued'&&!item.attemptedAt));
});
test('fresh changed draft rejects only that item and repeated approval does not duplicate',async()=>{
 const {store,resolver,leads}=setup();const {rows}=await previewBulkEmail(store,resolver,settings,ids);leads[ids[1]].revision='changed';
 const result=await approveBulkEmail(store,resolver,settings,approvals(rows),true);assert.equal(result.queued,1);assert.equal(result.failed,1);assert.match(result.rows[1].error,/draft changed/);
 const again=await approveBulkEmail(store,resolver,settings,approvals(rows),true);assert.equal(again.queued,0);assert.equal(store.read().items.length,1);
});
test('self-test, suppression, denial, duplicates and followup requirements apply at preview',async()=>{
 for(const scenario of ['test','suppressed','denied','duplicate','followup']) {
  const {store,resolver,leads}=setup();
  if(scenario==='test')store.transaction(state=>{state.test=undefined;});
  if(scenario==='suppressed')store.transaction(state=>{state.suppressed[leads[ids[0]].email]='Replied';});
  if(scenario==='denied')leads[ids[0]].stage='Denied';
  if(scenario==='duplicate')leads[ids[1]].email=leads[ids[0]].email;
  const {rows}=await previewBulkEmail(store,resolver,settings,ids,scenario==='followup'?'followup':'first');
  assert.ok(rows.some(row=>row.error),scenario);assert.equal(store.read().items.length,0);
 }
});
test('confirmation and all input validation happen before any queue write',async()=>{
 const {store,resolver}=setup();const {rows}=await previewBulkEmail(store,resolver,settings,ids);const items=approvals(rows);
 await assert.rejects(approveBulkEmail(store,resolver,settings,items,false),/Confirm/);
 await assert.rejects(approveBulkEmail(store,resolver,settings,[items[0],{...items[1],approvedHash:'bad'}],true),/exact/);
 await assert.rejects(previewBulkEmail(store,resolver,settings,Array(31).fill(ids[0])),/1 to 30/);
 await assert.rejects(previewBulkEmail(store,resolver,settings,[ids[0],ids[0]]),/once/);
 assert.equal(store.read().items.length,0);
});
test('changed sender footer, suppression and revoked test are checked again at approval',async()=>{
 for(const scenario of ['footer','suppression','test']){
  const {store,resolver}=setup();const {rows}=await previewBulkEmail(store,resolver,settings,ids);
  if(scenario==='suppression')store.transaction(state=>{state.suppressed['test0@example.com']='Bounced';});
  if(scenario==='test')store.transaction(state=>{state.test.verifiedAt=undefined;});
  const result=await approveBulkEmail(store,resolver,scenario==='footer'?{...settings,postalAddress:'Changed address'}:settings,approvals(rows),true);
  assert.equal(result.rows[0].queued,false,scenario);
 }
});
test('resolver failure is isolated and a mismatched identity never queues',async()=>{
 const {store,resolver}=setup();const {rows}=await previewBulkEmail(store,resolver,settings,ids);
 const result=await approveBulkEmail(store,id=>{if(id===ids[0])throw Error('Master unavailable');return {...resolver(id),id:ids[0]};},settings,approvals(rows),true);
 assert.equal(result.failed,2);assert.match(result.rows[0].error,/Master unavailable/);assert.match(result.rows[1].error,/does not match/);assert.equal(store.read().items.length,0);
});
