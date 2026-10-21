import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-settings-'));
process.env.HERMES_DATA_DIR=root;
const {getBusinessSettings,saveBusinessSettings}=await import('../src/lib/server/business-settings.ts');
test('ships with empty sources, morning off and fixed approved caps',()=>{
 const s=getBusinessSettings();assert.deepEqual(s.sources,[]);assert.equal(s.automaticMorningRun,false);assert.equal(s.dailyScrapeCapUsd,.5);assert.equal(s.dailyEmailLimit,20);assert.equal(s.weekendSending,false);
});
test('rejects spending and sending settings outside approved boundaries',()=>{
 assert.throws(()=>saveBusinessSettings({dailyScrapeCapUsd:1}),/0.50/);
 assert.throws(()=>saveBusinessSettings({dailyEmailLimit:31}),/30/);
 assert.throws(()=>saveBusinessSettings({hotThreshold:40,warmThreshold:50}),/threshold/);
 assert.throws(()=>saveBusinessSettings({automaticMorningRun:'true'}),/boolean/);
});
test('source settings validate types and public URLs and preserve exact entries',()=>{
 assert.throws(()=>saveBusinessSettings({sources:[{id:'x',type:'rss',value:'file:///etc/passwd',enabled:true,notes:''}]}),/public/);
 assert.throws(()=>saveBusinessSettings({sources:[{id:'x',type:'rss',value:'http://127.0.0.1/private',enabled:true,notes:''}]}),/public/);
 const sources=[{id:'source1',type:'subreddit',value:'shopify',enabled:false,notes:'Buyer language'}];
 assert.deepEqual(saveBusinessSettings({sources}).sources,sources);
 assert.deepEqual(getBusinessSettings().sources,sources);
});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
