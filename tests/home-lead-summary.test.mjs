import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHomeLeads } from '../src/lib/server/home-lead-summary.ts';
const lead=(id,patch={})=>({id,name:id,stage:'New',doNotContact:false,email:'business@example.com',drafts:{email:'Subject: Hello\n\nObserved need'},...patch});
test('home separates review candidates from queued mail and exclusions',()=>{
 const rows=[lead('review'),lead('queued'),lead('reply',{stage:'Replied'}),lead('denied',{stage:'Denied'}),lead('dnc',{doNotContact:true}),lead('call',{email:''}),lead('no-draft',{drafts:{email:''}})];
 const result=summarizeHomeLeads(rows,[{leadId:'queued',status:'queued'}]);assert.equal(result.readyToReview,1);assert.equal(result.needsContact,1);assert.equal(result.replies.length,1);assert.equal(result.replies[0].id,'reply');assert.deepEqual(result.drafts.map(r=>r.id),['review']);
});
test('paused and sent leads never show as first email approvals',()=>{assert.equal(summarizeHomeLeads([lead('p',{stage:'Paused'}),lead('s',{stage:'Sent'})],[]).readyToReview,0);});
