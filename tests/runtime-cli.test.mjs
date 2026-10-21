import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Codex bridge closes piped stdin even with a prompt argument',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-cli-test-'));
 const bin=path.join(temp,'codex.cjs');
 fs.writeFileSync(bin,`#!/usr/bin/env node
if(process.argv.includes('login'))console.log('Logged in using ChatGPT');
else{process.stdin.resume();process.stdin.on('end',()=>console.log('HERMES_OK'));}`);fs.chmodSync(bin,0o755);
 fs.writeFileSync(path.join(temp,'settings.json'),JSON.stringify({agentRuns:true}));
 process.env.CODEX_BIN=bin;process.env.HERMES_DATA_DIR=temp;
 try {const {sendToBridge}=await import('../src/lib/server/models.ts');assert.equal(await sendToBridge('codex','Test'), 'HERMES_OK');}
 finally{delete process.env.CODEX_BIN;delete process.env.HERMES_DATA_DIR;fs.rmSync(temp,{recursive:true,force:true});}
});
