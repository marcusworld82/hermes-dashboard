import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createAgentControlStore} from '../src/lib/server/agent-controls.ts';
const at=Date.parse('2026-10-20T16:00:00Z');
function set(store,id,state){const p=store.preview(id,state);return store.save(id,state,p.revision,p.previewHash);}
test('controls validate, preview, audit, reject stale save and revert only latest',()=>{const s=createAgentControlStore(':memory:');try{
 assert.throws(()=>s.preview('rico',{paused:false,dailyBudgetUsd:-1}));assert.throws(()=>s.read('../rico'));
 const p=s.preview('rico',{paused:true,dailyBudgetUsd:0});s.save('rico',p.proposed,p.revision,p.previewHash);
 assert.throws(()=>s.save('rico',p.proposed,p.revision,p.previewHash),/Preview again/);
 assert.equal(s.history('rico').length,1);const audit=s.history('rico')[0];s.revert('rico',audit.id,1);assert.deepEqual(s.read('rico').state,{paused:false,dailyBudgetUsd:null});assert.throws(()=>s.revert('rico',audit.id,1),/Preview again/);
}finally{s.close();}});
test('pause blocks subscription and API work; zero cap blocks billable and unknown work',()=>{const s=createAgentControlStore(':memory:');try{
 set(s,'rico',{paused:true,dailyBudgetUsd:null});for(const billing of ['api','subscription','unknown'])assert.throws(()=>s.reserve('rico',{operation:'test',billing,maxCostUsd:1},at),/paused/);
 set(s,'rico',{paused:false,dailyBudgetUsd:0});assert.throws(()=>s.reserve('rico',{operation:'api',billing:'api',maxCostUsd:1},at),/exceeded/);assert.throws(()=>s.reserve('rico',{operation:'Hermes',billing:'unknown'},at),/unbounded/);
 const run=s.reserve('rico',{operation:'verified plan',billing:'subscription'},at);s.finish(run,{actualCostUsd:123,lastMessage:'answer'});const a=s.activity('rico',at);assert.equal(a.knownCostUsd,0);assert.equal(a.subscriptionRuns,1);assert.equal(a.lastMessage,'answer');
}finally{s.close();}});
test('concurrent store reservations cannot oversubscribe cap; unknown costs keep reservations',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-controls-'));const file=path.join(dir,'controls.sqlite');const a=createAgentControlStore(file),b=createAgentControlStore(file);try{
 set(a,'rico',{paused:false,dailyBudgetUsd:1});const one=a.reserve('rico',{operation:'bounded',billing:'api',maxCostUsd:.6},at);assert.throws(()=>b.reserve('rico',{operation:'bounded',billing:'api',maxCostUsd:.6},at),/exceeded/);
 a.finish(one,{actualCostUsd:.2});const two=b.reserve('rico',{operation:'timeout',billing:'unknown',maxCostUsd:.8},at);b.finish(two,{failed:true});assert.equal(a.activity('rico',at).reservedUsd,.8);assert.equal(a.activity('rico',at).knownCostUsd,.2);assert.throws(()=>a.reserve('rico',{operation:'new',billing:'api',maxCostUsd:.01},at),/exceeded/);
}finally{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('new caps fail closed after unpriced same-day work and running reservations cross midnight',()=>{const s=createAgentControlStore(':memory:');try{
 const unknown=s.reserve('rico',{operation:'unpriced',billing:'unknown'},at);s.finish(unknown,{});set(s,'rico',{paused:false,dailyBudgetUsd:5});assert.throws(()=>s.reserve('rico',{operation:'priced',billing:'api',maxCostUsd:1},at),/unpriced/);
 const start=Date.parse('2026-10-21T03:59:00Z');set(s,'quinn',{paused:false,dailyBudgetUsd:1});const active=s.reserve('quinn',{operation:'long',billing:'api',maxCostUsd:1},start);assert.throws(()=>s.reserve('quinn',{operation:'next',billing:'api',maxCostUsd:1},start+120000),/exceeded/);s.finish(active,{actualCostUsd:1});
}finally{s.close();}});
