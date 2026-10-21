import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { paths } from './paths.ts';
import { finderEnvironment } from './claude-finder.ts';
import { openMorningStore } from './morning-store.ts';
import { morningTime } from './morning-pipeline.ts';
import { requireRuns } from './settings.ts';
export const MORNING_MODEL_LIMIT = 3;
export function morningModelConsent() {const store=openMorningStore();try{return store.get<{enabled:boolean;approvedAt?:number}>('morning-model-consent',{enabled:false});}finally{store.close();}}
export function approveMorningModels(enabled:boolean,approvedCalls?:number){if(enabled&&approvedCalls!==MORNING_MODEL_LIMIT)throw Error('Approve exactly 3 bounded Claude subscription calls per day.');const store=openMorningStore();try{store.set('morning-model-consent',{enabled,approvedAt:Date.now()});return morningModelConsent();}finally{store.close();}}
export async function runMorningModel(agentId:'rico'|'maya'|'quinn',operation:string,prompt:string) {
 if(process.env.VERCEL||process.env.HERMES_DEPLOYMENT_MODE==='persistent-host')throw Error('Morning Claude steps require the signed-in Mac.');
 requireRuns();if(!morningModelConsent().enabled)throw Error('Approve the separate daily Claude allowance first. Discovery approval does not authorize model calls.');
 const {claudeBilling}=await import('./models.ts');
 const {checkAgentRun}=await import('./agent-controls.ts');
 checkAgentRun(agentId,{operation,billing:'subscription'});
 if(await claudeBilling(finderEnvironment())!=='subscription')throw Error('Verified Claude subscription sign-in is required. Unknown or API billing cannot use morning consent.');
 const store=openMorningStore(),day=morningTime(Date.now()).day;
 try {reserveMorningModelCall(store,day);}finally{store.close();}
 const {withAgentRun}=await import('./agent-controls.ts');
 return withAgentRun(agentId,{operation,billing:'subscription',maxCostUsd:.15},async()=>{
  requireRuns();if(!morningModelConsent().enabled)throw Error('Morning model allowance was turned off.');
  const args=['-p','--safe-mode','--restricted','--disable-slash-commands','--no-chrome','--permission-prompts','none','--output-format','json','--strict-mcp-config','--setting-sources','','--tools','','--max-budget-usd','0.15','--no-session-persistence'];
  const promise=promisify(execFile)(paths.claudeBin,args,{env:finderEnvironment(),timeout:180000,maxBuffer:400000,cwd:process.cwd()});promise.child.stdin?.end(prompt);
  let stdout:string;try{stdout=(await promise).stdout;}catch{throw Error('Claude stopped or timed out. The call allowance remains consumed; no retry was started.');}
  const envelope=JSON.parse(stdout);if(envelope.is_error)throw Error('Claude reported an error. No generated output accepted.');
  const raw=typeof envelope.result==='string'?envelope.result:JSON.stringify(envelope.structured_output);
  const value=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  return {value,actualCostUsd:null,lastMessage:`${operation} finished; subscription usage, cash cost unreported.`};
 });
}

export function reserveMorningModelCall(store:ReturnType<typeof openMorningStore>,day:string){for(let n=0;n<MORNING_MODEL_LIMIT;n++)if(store.claimOnce(`morning-model:${day}:${n}`))return;throw Error('The daily allowance of 3 calls is used. Failed or uncertain calls are not automatically retried.');}
