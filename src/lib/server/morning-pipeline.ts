import type { createMorningStore, MorningStep } from './morning-store.ts';
export const MORNING_STAGES = [ ['lead-discovery',420], ['verify-leads',435], ['rico-drafts',450], ['content-research',460], ['quinn-review',470], ['morning-brief',480] ] as const;
export function morningTime(now:number) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {day:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute),kind:['Mon','Wed','Fri'].includes(parts.weekday)?'side-hustle':['Tue','Thu','Sat'].includes(parts.weekday)?'real-estate':null};
}
export async function runTimedMorning(deps:{now:number;enabled:boolean;store:ReturnType<typeof createMorningStore>;handlers:Record<string,()=>Promise<{detail?:string;[key:string]:unknown}>>;stillEnabled?:()=>boolean;nowFn?:()=>number}) {
 if(!deps.enabled)return {skipped:'Morning switch is off.'};
 const clock=morningTime(deps.now);
 if(clock.minute<420||clock.minute>495)return {skipped:'Outside the morning window. Previous days are never replayed.'};
 let record=deps.store.runs().find(r=>r.day===clock.day);
 if(!record){if(clock.minute>=480)return {skipped:'No morning started before 8 AM. No late discovery.'};record={day:clock.day,claimedAt:deps.now,kind:clock.kind,steps:[]};deps.store.claim(record);record=deps.store.runs().find(r=>r.day===clock.day)!;}
 for(const [name,minute] of MORNING_STAGES){
  const currentClock=morningTime(deps.nowFn?.()??deps.now);if(currentClock.day!==clock.day||currentClock.minute>495)break;
  if(currentClock.minute<minute||record.steps.some(s=>s.name===name))continue;
  if(deps.stillEnabled&&!deps.stillEnabled())break;
  if(!deps.store.claimOnce(`morning:${clock.day}:${name}`))continue;
  let result:MorningStep;
  // Save before dispatch. A stopped worker never silently retries uncertain work.
  record=deps.store.mutateRun(clock.day,current=>({...current,steps:[...current.steps,{name,status:'running',detail:'Step claimed. If interrupted, inspect saved evidence before retrying.'}]}));
  try {
   if(!clock.kind&&['lead-discovery','verify-leads','rico-drafts'].includes(name))result={name,status:'skipped',detail:'Sunday: no lead work.'};
   else if(name!=='morning-brief'&&currentClock.minute>=480)result={name,status:'skipped',detail:'Missed step before 8 AM. No late model or discovery replay.'};
   else if(!deps.handlers[name])result={name,status:'error',detail:'This step has no configured handler.'};
   else {const data=await deps.handlers[name]();result={name,status:'ok',detail:data.detail||'Saved step evidence.',data};}
  }catch(error){result={name,status:'error',detail:error instanceof Error?error.message:'Step failed.'};}
  // Merge with newest record so concurrent worker completion cannot erase a step.
  record=deps.store.mutateRun(clock.day,current=>({...current,steps:current.steps.map(s=>s.name===name?result:s),...(name==='morning-brief'?{finishedAt:deps.now}:{})}));
 }
 return {record};
}
