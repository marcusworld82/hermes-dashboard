#!/usr/bin/env node
// Persistent local media worker. Jobs and leases survive service restarts.
import fs from 'node:fs';
import {startWorkerHeartbeat} from './worker-heartbeat.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tickSupervisor } from './supervisor-tick.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(app);
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const {runNextTask,workerHeartbeat}=await import('../src/lib/server/content-machine.ts');
const {executeContentTask}=await import('../src/lib/server/content-executor.ts');
const {runNextToolJob}=await import('../src/lib/server/tool-jobs.ts');
const {writeJson}=await import('../src/lib/server/store.ts');
const {runLocalAutomationTick}=await import('../src/lib/server/morning-worker.ts');
const stopHeartbeat=startWorkerHeartbeat(workerHeartbeat);
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
// Existing workflow schedules run only when explicitly enabled in Hermes.
let ticking=false;
async function tick(){if(ticking||stopping)return;ticking=true;try{
 const result=await tickSupervisor();writeJson('supervisor-health',result);
 console.log(JSON.stringify({event:'supervisor-tick',...result}));
}catch{console.error('Supervisor status could not be saved.');}finally{
 try { await runLocalAutomationTick(); } catch { console.error('Local automation tick failed. Existing approvals and daily claims are preserved.'); }
 ticking=false;}}
const timer=process.argv.includes('--once')?null:setInterval(tick,60000);timer?.unref();
do{workerHeartbeat();try{const pieceFlag=process.argv.indexOf('--piece');const onlyPieceId=pieceFlag<0?undefined:process.argv[pieceFlag+1];const did=(!onlyPieceId&&await runNextToolJob())||await runNextTask(executeContentTask,onlyPieceId);if(process.argv.includes('--once'))break;if(did)continue;}catch(e){console.error('Content worker:',e.message);}if(!stopping)await new Promise(r=>setTimeout(r,3000));}while(!stopping);
if(timer)clearInterval(timer);
stopHeartbeat();
