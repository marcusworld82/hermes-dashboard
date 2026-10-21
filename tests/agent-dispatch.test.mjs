import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('real dashboard dispatch gates stop a paused/capped profile before spawning, preserving global stop',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-dispatch-'));const bin=path.join(dir,'fake-hermes.cjs');fs.writeFileSync(bin,`#!/usr/bin/env node\nrequire('fs').appendFileSync(process.env.HERMES_DATA_DIR+'/calls','called\\n');console.log('Mock reply');`);fs.chmodSync(bin,0o755);process.env.HERMES_BIN=bin;process.env.HERMES_DATA_DIR=dir;fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({agentRuns:true}));
 try{
  const {agentControlRequest}=await import('../src/lib/server/agent-controls.ts');const {askProfile}=await import('../src/lib/server/hermes.ts');
  function set(state){const p=agentControlRequest('rico','preview',{state});agentControlRequest('rico','save',{state,revision:p.revision,previewHash:p.previewHash});}
  set({paused:true,dailyBudgetUsd:null});await assert.rejects(askProfile('rico','test'),/paused/);assert.equal(fs.existsSync(path.join(dir,'calls')),false);
  set({paused:false,dailyBudgetUsd:1});await assert.rejects(askProfile('rico','test'),/unbounded/);assert.equal(fs.existsSync(path.join(dir,'calls')),false);
  set({paused:false,dailyBudgetUsd:null});assert.equal(await askProfile('rico','test'),'Mock reply');assert.equal(fs.readFileSync(path.join(dir,'calls'),'utf8'),'called\n');
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({agentRuns:false}));await assert.rejects(askProfile('rico','test'),/runs are off/);assert.equal(fs.readFileSync(path.join(dir,'calls'),'utf8'),'called\n');
 }finally{delete process.env.HERMES_BIN;delete process.env.HERMES_DATA_DIR;fs.rmSync(dir,{recursive:true,force:true});}
});
