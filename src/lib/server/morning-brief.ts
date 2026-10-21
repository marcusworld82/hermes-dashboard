import { sendMorningTelegram } from './morning-brief-telegram.ts';
import { openMorningStore } from './morning-store.ts';
import { morningTime } from './morning-pipeline.ts';
import { discoveryStatus } from './discovery.ts';
import { readContentIdeas } from './morning-content.ts';
import { syncLeadResearchRecords } from './lead-actions.ts';
export async function saveMorningBrief(){
 const store=openMorningStore(),day=morningTime(Date.now()).day;
 try {
  const run=store.runs().find(r=>r.day===day),saved=store.get<{day:string;researched:number;withEmail:number;duplicates:number;checkedAt:number}|null>('morning-verified',null),verification=saved?.day===day?saved:null;
  const discovery=discoveryStatus(),ideas=readContentIdeas(),data={day,checkedAt:Date.now(),verification,discovery,ideas:ideas.ideas.length,ideasCheckedAt:ideas.checkedAt,review:store.get('morning-review',null),steps:run?.steps.filter(s=>s.name!=='morning-brief')||[],telegram:'Morning Telegram permission will be checked separately.'};
  store.set('morning-brief',data);
  const telegram=await sendMorningTelegram(store,data);store.set('morning-brief',{...data,telegram});
  const key=`morning-run-log:${day}`,record={run_name:`Marcus OS morning ${day}`,started:new Date(run?.claimedAt||Date.now()).toISOString(),ended:new Date().toISOString(),segment:'All',mode:'Live',run_ids:`hermes-morning:${day}`,results_found:verification?.researched??0,duplicates:verification?.duplicates??0,cost_usd:discovery.accountedUsd,errors:data.steps.filter(s=>s.status==='error'||s.status==='running').map(s=>`${s.name}: ${s.detail}`).join('\n').slice(0,10000),checkpoint:JSON.stringify({day,withEmail:verification?.withEmail??0,ideas:data.ideas,ideasCheckedAt:data.ideasCheckedAt,modelCost:'Subscription usage unpriced; discovery cost includes daily reservations and is not an invoice.'}),retry_status:'None'};
  store.set(key,{status:'pending',record,at:Date.now()});
  try {await syncLeadResearchRecords({companies:[],people:[],opportunities:[],evidence:[],run_log:[record]});store.set(key,{status:'synced',at:Date.now()});}
  catch {store.set(key,{status:'pending',record,at:Date.now(),error:'Notion did not confirm the morning summary. Local brief preserved. Refresh brief to retry the same Run ID.'});return {detail:'Local morning brief saved. Notion summary remains pending; refresh brief to retry. Telegram status is recorded separately.',ideas:data.ideas,notion:'pending'};}
  return {detail:'Morning brief and idempotent Notion Run Log summary saved. Telegram status is recorded separately.',ideas:data.ideas,notion:'synced'};
 }finally{store.close();}
}
