import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getBusinessSettings, type BusinessSettings } from './business-settings.ts';
import { paths } from './paths.ts';

export type DiscoveryKind = 'side-hustle' | 'real-estate';
export type DiscoveryPlan = { kind: DiscoveryKind; actor: string; label: string; target: number; input: Record<string, unknown>; units: Record<string, number>; dailyCapUsd: number; estimateUsd: number; reservedCapUsd: number; verifiedAt: string; build: string; note: string; draftContext?: Record<string,string> };
export type DiscoveryJob = { id: string; plan: DiscoveryPlan; phase: string; createdAt: string; updatedAt?: string; approved: boolean; approvedCapUsd: number; runId?: string; actorStatus?: string; actualUsd?: number | null; found?: number; rawCount?: number; error?: string | null; recordsPath?: string; syncCommand?: string[]; syncCwd?: string };
type Quote = { id: string; plan: DiscoveryPlan; settingsHash: string; expiresAt: number };
const root = process.env.LEAD_RESEARCH_ROOT || path.join(os.homedir(), 'Desktop/LYFE WITH MARCUS/AI Content Business/lead-research');
const directory = () => path.join(paths.data, 'discovery');
const python = () => process.env.LEAD_RESEARCH_PYTHON || '/usr/bin/python3';
const disabled = () => process.env.VERCEL ? 'Discovery runs on Marcus’s Mac. Cloud discovery is unavailable.' : !process.env.APIFY_TOKEN ? 'APIFY_TOKEN is missing. Add it to Marcus OS .env.local and restart Marcus OS. Actor schema and pricing are not yet verified.' : !fs.existsSync(path.join(root, 'src/leadresearch/dashboard.py')) ? 'The local Lead Research worker is missing.' : null;
export function settingsHash(settings: BusinessSettings) { return crypto.createHash('sha256').update(JSON.stringify({services:settings.services,niche:settings.niche,location:settings.location,dailyScrapeCapUsd:settings.dailyScrapeCapUsd,senderName:settings.senderName,businessName:settings.businessName,signature:settings.signature,postalAddress:settings.postalAddress})).digest('hex'); }
function assertId(id: unknown): asserts id is string { if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid discovery ID.'); }
function file(id: string, type: 'job'|'quote') { assertId(id); return path.join(directory(), `${id}.${type}.json`); }
function save(target: string, value: unknown) { fs.mkdirSync(directory(), {recursive:true}); const temp = `${target}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2), {mode:0o600}); fs.renameSync(temp,target); }
function read<T>(target: string): T { return JSON.parse(fs.readFileSync(target,'utf8')); }
function publicJob(job: DiscoveryJob) { const { recordsPath: _recordsPath, syncCommand: _command, syncCwd: _cwd, ...value } = job; void _recordsPath; void _command; void _cwd; return value; }
export function validateApproval(quote: Quote, approvedCapUsd: unknown, settings: BusinessSettings, now = Date.now()) {
  if (quote.expiresAt < now) throw Error('This quote expired. Show the current cost again.');
  if (quote.settingsHash !== settingsHash(settings)) throw Error('Business settings changed. Show the current cost again.');
  if (typeof approvedCapUsd !== 'number' || !Number.isFinite(approvedCapUsd) || approvedCapUsd !== quote.plan.reservedCapUsd || approvedCapUsd <= 0 || approvedCapUsd > Math.min(.5,settings.dailyScrapeCapUsd)) throw Error('Approve the exact displayed maximum cost.');
}
export function discoveryStatus() {
  const jobs: ReturnType<typeof publicJob>[] = [];
  if (fs.existsSync(directory())) for (const name of fs.readdirSync(directory()).filter(v=>v.endsWith('.job.json'))) {
    try { jobs.push(publicJob(read<DiscoveryJob>(path.join(directory(),name)))); } catch { /* Preserve unreadable job for review. */ }
  }
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let accountedUsd: number | null = 0;
  const ledger = path.join(root,'data/daily_budget.json');
  if (fs.existsSync(ledger)) try { const rows = read<Record<string,Record<string,number>>>(ledger)[day] || {}; accountedUsd = Object.values(rows).reduce((a,b)=>a+b,0); } catch { accountedUsd = null; }
  return {disabledReason:disabled(),dailyCapUsd:Math.min(.5,getBusinessSettings().dailyScrapeCapUsd),accountedUsd,jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30),runtime:'Local Mac'};
}
export async function quoteDiscovery(kind: unknown) {
  const reason = disabled(); if (reason) throw Error(reason);
  if (kind !== 'side-hustle' && kind !== 'real-estate') throw Error('Choose a discovery type.');
  const { preflightLeadResearchWrite } = await import('./lead-actions.ts');
  await preflightLeadResearchWrite();
  const settings = getBusinessSettings();
  const result = await new Promise<string>((resolve,reject)=> {
    const child = execFile(python(),['-m','leadresearch.dashboard','quote'],{cwd:root,env:{...process.env,PYTHONPATH:path.join(root,'src')},timeout:75_000,maxBuffer:1_000_000},(error,stdout)=>error?reject(Error('Read-only Actor verification failed. Nothing ran.')):resolve(stdout));
    child.stdin?.end(JSON.stringify({kind,settings}));
  });
  const response = JSON.parse(result) as {ok:boolean;plan:DiscoveryPlan;error?:string};
  if (!response.ok) throw Error(response.error || 'Actor schema verification is required.');
  const quote: Quote = {id:crypto.randomUUID(),plan:response.plan,settingsHash:settingsHash(settings),expiresAt:Date.now()+10*60_000};
  save(file(quote.id,'quote'),quote);
  return quote;
}
function launch(jobFile: string) {
  const child = spawn(python(),['-m','leadresearch.dashboard','run',jobFile],{cwd:root,env:{...process.env,PYTHONPATH:path.join(root,'src')},detached:true,stdio:'ignore'});
  child.on('error',()=> { const job = read<DiscoveryJob>(jobFile); if (job.phase==='queued') save(jobFile,{...job,phase:'failed',error:'The local Python worker could not start.'}); });
  child.unref();
}
export function startDiscovery(id: unknown, approvedCapUsd: unknown) {
  const reason=disabled(); if(reason) throw Error(reason); assertId(id);
  const quote = read<Quote>(file(id,'quote'));
  validateApproval(quote,approvedCapUsd,getBusinessSettings());
  // Exclusive file creation consumes this exact quote once, even across server processes.
  fs.writeFileSync(file(id,'job'),JSON.stringify({id,plan:quote.plan,phase:'queued',createdAt:new Date().toISOString(),approved:true,approvedCapUsd,syncCommand:[process.execPath,'--input-type=module','-e',"const {syncDiscovery}=await import(process.argv[1]); await syncDiscovery(process.argv[2]);",pathToFileURL(path.join(process.cwd(),'src/lib/server/discovery.ts')).href,id],syncCwd:process.cwd()}),{flag:'wx',mode:0o600});
  launch(file(id,'job'));
  return {id};
}
export function resumeDiscovery(id: unknown) {
  const reason=disabled(); if(reason) throw Error(reason); assertId(id);
  const job=read<DiscoveryJob>(file(id,'job'));
  if (!job.runId || !['failed','polling','building'].includes(job.phase)) throw Error('Only a saved Actor run can resume. An unknown start must be checked in Apify Console.');
  launch(file(id,'job')); return {id};
}
const syncing = new Set<string>();
export async function syncDiscovery(id: unknown) {
  assertId(id);
  const jobFile=file(id,'job');
  const job=read<DiscoveryJob>(jobFile);
  if (job.phase==='complete') return {id,complete:true};
  if (job.phase!=='awaiting-sync' || !job.recordsPath) throw Error('This run has no prepared records to sync.');
  if(syncing.has(id)) return {id,busy:true};
  syncing.add(id);
  try {
    const { syncLeadResearchRecords } = await import('./lead-actions.ts');
    const result = await syncLeadResearchRecords(read<Record<string,unknown>>(job.recordsPath));
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) throw Error('Notion sync did not complete.');
    save(jobFile,{...job,phase:'complete',updatedAt:new Date().toISOString(),error:null});
    return {id,complete:true};
  } catch {
    save(jobFile,{...job,error:'Notion sync failed. Prepared records are saved. Verify the schema and connection, then retry sync.'});
    throw Error('Notion sync failed. Prepared records are saved for retry.');
  } finally { syncing.delete(id); }
}
