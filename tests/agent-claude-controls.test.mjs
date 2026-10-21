import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('Claude checks pause and billing before dispatch, subscription cash stays unknown, API ceiling stays bounded',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-claude-'));const bin=path.join(dir,'claude.cjs');
 fs.writeFileSync(bin,`#!/usr/bin/env node
const fs=require('fs');const p=process.env.HERMES_DATA_DIR;
if(process.argv.includes('auth'))console.log(JSON.stringify({loggedIn:true,authMethod:fs.readFileSync(p+'/auth','utf8')}));
else {fs.appendFileSync(p+'/calls',JSON.stringify({args:process.argv,hasApiKey:!!process.env.ANTHROPIC_API_KEY})+'\\n');process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({result:'Verified mock answer',total_cost_usd:99})));}`);
 fs.chmodSync(bin,0o755);process.env.CLAUDE_BIN=bin;process.env.HERMES_DATA_DIR=dir;process.env.ANTHROPIC_API_KEY='synthetic-do-not-pass';fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({agentRuns:true}));fs.writeFileSync(path.join(dir,'auth'),'claude.ai');
 try{const {claudeSend}=await import('../src/lib/server/models.ts');const {agentControlRequest,getAgentControlActivity}=await import('../src/lib/server/agent-controls.ts');
 function set(state){const p=agentControlRequest('rico','preview',{state});agentControlRequest('rico','save',{state,revision:p.revision,previewHash:p.previewHash});}
 set({paused:true,dailyBudgetUsd:0});await assert.rejects(claudeSend('Test',{agentId:'rico'}),/paused/);assert.equal(fs.existsSync(path.join(dir,'calls')),false);
 set({paused:false,dailyBudgetUsd:0});assert.equal(await claudeSend('Test',{agentId:'rico',tools:[]}),'Verified mock answer');assert.equal(getAgentControlActivity('rico').knownCostUsd,0);assert.equal(getAgentControlActivity('rico').subscriptionRuns,1);
 const call=JSON.parse(fs.readFileSync(path.join(dir,'calls'),'utf8'));assert.equal(call.hasApiKey,false);assert.equal(call.args[call.args.indexOf('--max-budget-usd')+1],'1');
 fs.writeFileSync(path.join(dir,'auth'),'api_key');await assert.rejects(claudeSend('Test',{agentId:'rico'}),/exceeded/);assert.equal(fs.readFileSync(path.join(dir,'calls'),'utf8').trim().split('\n').length,1);
 set({paused:false,dailyBudgetUsd:1});await claudeSend('Test',{agentId:'rico'});assert.equal(getAgentControlActivity('rico').knownCostUsd,0);assert.equal(getAgentControlActivity('rico').reservedUsd,1);await assert.rejects(claudeSend('Test',{agentId:'rico'}),/exceeded/);
 }finally{delete process.env.CLAUDE_BIN;delete process.env.HERMES_DATA_DIR;delete process.env.ANTHROPIC_API_KEY;fs.rmSync(dir,{recursive:true,force:true});}
});
