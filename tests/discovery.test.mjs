import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-'));
process.env.HERMES_DATA_DIR=root;
process.env.LEAD_RESEARCH_ROOT=root;
delete process.env.APIFY_TOKEN;
const {discoveryStatus,quoteDiscovery,startDiscovery,settingsHash,validateApproval}=await import('../src/lib/server/discovery.ts');
const {businessDefaults}=await import('../src/lib/server/business-settings.ts');
const settings={...businessDefaults,services:'Video',niche:'Clothing',location:'Cleveland'};
const quote={id:'q',settingsHash:settingsHash(settings),expiresAt:100,plan:{reservedCapUsd:.5}};
test('cost approval must match exact quote and current settings',()=>{
 assert.doesNotThrow(()=>validateApproval(quote,.5,settings,50));
 assert.throws(()=>validateApproval(quote,.49,settings,50),/exact/);
 assert.throws(()=>validateApproval(quote,.5,settings,101),/expired/);
 assert.throws(()=>validateApproval(quote,.5,{...settings,niche:'other'},50),/changed/);
 assert.throws(()=>validateApproval(quote,NaN,settings,50),/exact/);
});
test('missing API key disables quotes before any worker or paid action',async()=>{
 assert.match(discoveryStatus().disabledReason,/APIFY_TOKEN/);
 await assert.rejects(quoteDiscovery('side-hustle'),/APIFY_TOKEN/);
 assert.throws(()=>startDiscovery('id',.5),/APIFY_TOKEN/);
 assert.equal(fs.existsSync(path.join(root,'discovery')),false);
});
test('cloud mode remains unavailable',()=>{
 process.env.VERCEL='1';assert.match(discoveryStatus().disabledReason,/Cloud discovery is unavailable/);delete process.env.VERCEL;
});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
