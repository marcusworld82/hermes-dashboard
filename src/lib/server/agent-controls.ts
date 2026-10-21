import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from './paths.ts';

export type AgentPolicy = { paused: boolean; dailyBudgetUsd: number | null };
export type AgentRunOptions = { operation: string; billing: 'subscription' | 'api' | 'unknown'; maxCostUsd?: number };
export type AgentControlActivity = AgentPolicy & { day: string; knownCostUsd: number; reservedUsd: number; unknownCostRuns: number; subscriptionRuns: number; activeRuns: number; lastMessage: string | null; lastRunAt: number | null; scope: string };
const SCOPE = 'New dashboard dispatches only. Existing runs and external CLI or gateway work are not stopped. API budget excludes subscription usage; missing API cost keeps its full reservation.';
const defaults: AgentPolicy = { paused: false, dailyBudgetUsd: null };
function agentId(id: string) { if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw Error('Invalid agent ID.'); return id; }
function policy(value: unknown): AgentPolicy { const v = value as AgentPolicy; if (!v || typeof v.paused !== 'boolean' || !(v.dailyBudgetUsd === null || typeof v.dailyBudgetUsd === 'number' && Number.isFinite(v.dailyBudgetUsd) && v.dailyBudgetUsd >= 0 && v.dailyBudgetUsd <= 1000)) throw Error('Choose pause and a daily API budget from $0 to $1,000, or leave it uncapped.'); return { paused:v.paused, dailyBudgetUsd:v.dailyBudgetUsd }; }
function day(at: number) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(at); }
function hash(value: unknown) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function createAgentControlStore(file: string) {
  if(file !== ':memory:') fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file); db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS policies(id TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS policy_audit(id TEXT PRIMARY KEY, agent TEXT NOT NULL, at INTEGER NOT NULL, before_value TEXT NOT NULL, after_value TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_runs(id TEXT PRIMARY KEY, agent TEXT NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL, operation TEXT NOT NULL, billing TEXT NOT NULL, reservation REAL, actual REAL, status TEXT NOT NULL, message TEXT);
  `);
  if(file !== ':memory:') fs.chmodSync(file,0o600);
  function transaction<T>(fn:()=>T) { db.exec('BEGIN IMMEDIATE'); try { const value=fn();db.exec('COMMIT');return value; } catch(e) {db.exec('ROLLBACK');throw e;} }
  function read(id:string) { agentId(id);const row=db.prepare('SELECT value,revision FROM policies WHERE id=?').get(id) as {value:string;revision:number}|undefined;return {state:row?policy(JSON.parse(row.value)):{...defaults},revision:row?.revision??0}; }
  function activity(id:string,at=Date.now()):AgentControlActivity {
    const {state}=read(id); const rows=db.prepare("SELECT * FROM agent_runs WHERE agent=? AND (day=? OR status='running')").all(id,day(at)) as unknown as {billing:string;reservation:number|null;actual:number|null;status:string}[];
    const latest=db.prepare('SELECT at,message FROM agent_runs WHERE agent=? ORDER BY at DESC LIMIT 1').get(id) as {at:number;message:string|null}|undefined;
    return {...state,day:day(at),knownCostUsd:rows.reduce((s,r)=>s+(r.actual??0),0),reservedUsd:rows.reduce((s,r)=>s+(r.actual===null?r.reservation??0:0),0),unknownCostRuns:rows.filter(r=>r.billing!=='subscription'&&r.actual===null).length,subscriptionRuns:rows.filter(r=>r.billing==='subscription').length,activeRuns:rows.filter(r=>r.status==='running').length,lastMessage:latest?.message??null,lastRunAt:latest?.at??null,scope:SCOPE};
  }
  function preview(id:string,value:unknown) { const current=read(id),next=policy(value);return { ...current, proposed:next,previewHash:hash({id,...current,next}),diff:`Paused: ${current.state.paused} → ${next.paused}\nDaily API budget: ${current.state.dailyBudgetUsd??'uncapped'} → ${next.dailyBudgetUsd??'uncapped'}`,scope:SCOPE }; }
  function save(id:string,value:unknown,revision:number,previewHash:string) { return transaction(()=>{const p=preview(id,value);if(p.revision!==revision||p.previewHash!==previewHash)throw Error('Controls changed. Preview again.');const rev=revision+1;db.prepare('INSERT OR REPLACE INTO policies VALUES(?,?,?)').run(id,JSON.stringify(p.proposed),rev);db.prepare('INSERT INTO policy_audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),id,Date.now(),JSON.stringify(p.state),JSON.stringify(p.proposed),rev);return read(id);}); }
  function history(id:string) {agentId(id);return db.prepare('SELECT id,at,before_value,after_value,revision FROM policy_audit WHERE agent=? ORDER BY revision DESC LIMIT 20').all(id);}
  function revert(id:string,auditId:string,revision:number) { const a=db.prepare('SELECT before_value,revision FROM policy_audit WHERE id=? AND agent=?').get(auditId,id) as {before_value:string;revision:number}|undefined;if(!a||a.revision!==revision)throw Error('Only the latest unchanged control save can be reverted.');const p=preview(id,JSON.parse(a.before_value));return save(id,p.proposed,revision,p.previewHash); }
  function check(id:string,opts:AgentRunOptions,at=Date.now()) {
    const current=activity(id,at); if(current.paused)throw Error(`${id} is paused for new dashboard runs.`);
    if(opts.billing!=='subscription'&&current.dailyBudgetUsd!==null) {
      if(opts.maxCostUsd===undefined||!Number.isFinite(opts.maxCostUsd)||opts.maxCostUsd<=0)throw Error(`${id}'s API budget requires a provider-enforced maximum. This runner has unknown or unbounded cost.`);
      if(current.unknownCostRuns && db.prepare("SELECT 1 FROM agent_runs WHERE agent=? AND (day=? OR status='running') AND billing!='subscription' AND actual IS NULL AND reservation IS NULL LIMIT 1").get(id,day(at)))throw Error(`${id} has unpriced usage today. No further API work until cost is known or the next day.`);
      if(current.knownCostUsd+current.reservedUsd+opts.maxCostUsd>current.dailyBudgetUsd+1e-9)throw Error(`${id}'s daily API budget would be exceeded.`);
    }
  }
  function reserve(id:string,opts:AgentRunOptions,at=Date.now()) { return transaction(()=>{check(id,opts,at);if(!['subscription','api','unknown'].includes(opts.billing)||!opts.operation.trim())throw Error('Invalid run accounting.');if(opts.maxCostUsd!==undefined&&(!Number.isFinite(opts.maxCostUsd)||opts.maxCostUsd<=0))throw Error('Invalid maximum cost.');const runId=crypto.randomUUID();db.prepare('INSERT INTO agent_runs VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId,id,at,day(at),opts.operation.slice(0,200),opts.billing,opts.billing==='subscription'?null:opts.maxCostUsd??null,null,'running',null);return runId;}); }
  function finish(runId:string,result:{actualCostUsd?:number|null;lastMessage?:string;failed?:boolean}) {transaction(()=>{const row=db.prepare('SELECT billing,status FROM agent_runs WHERE id=?').get(runId) as {billing:string;status:string}|undefined;if(!row||row.status!=='running')throw Error('Run already recorded.');const cost=row.billing==='subscription'?null:result.actualCostUsd??null;if(cost!==null&&(!Number.isFinite(cost)||cost<0))throw Error('Invalid actual cost.');db.prepare('UPDATE agent_runs SET actual=?,status=?,message=? WHERE id=?').run(cost,result.failed?'failed':'finished',result.lastMessage?.slice(0,2000)??null,runId);}); }
  return {read,preview,save,revert,history,activity,check,reserve,finish,close:()=>db.close()};
}
function open(){return createAgentControlStore(path.join(paths.data,'agent-controls.sqlite'));}
export function getAgentControlActivity(id:string){const store=open();try{return store.activity(id);}finally{store.close();}}
export function checkAgentRun(id:string,opts:AgentRunOptions){const store=open();try{store.check(id,opts);}finally{store.close();}}
export async function withAgentRun<T>(id:string,opts:AgentRunOptions,run:()=>Promise<{value:T;actualCostUsd?:number|null;lastMessage?:string}>):Promise<T>{
  const store=open();let runId:string|undefined;
  try{runId=store.reserve(id,opts);const result=await run();store.finish(runId,result);runId=undefined;return result.value;}
  catch(e){if(runId)store.finish(runId,{failed:true});throw e;}finally{store.close();}
}
export function agentControlRequest(id:string,action:string,input:Record<string,unknown>={}){const store=open();try{if(action==='read')return {...store.read(id),activity:store.activity(id),history:store.history(id),scope:SCOPE};if(action==='preview')return store.preview(id,input.state);if(action==='save')return store.save(id,input.state,Number(input.revision),String(input.previewHash));if(action==='revert')return store.revert(id,String(input.auditId),Number(input.revision));throw Error('Unknown control action.');}finally{store.close();}}
