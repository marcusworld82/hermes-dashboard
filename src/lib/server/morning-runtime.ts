import { runTimedMorning, morningTime, MORNING_STAGES } from './morning-pipeline.ts';
import { openMorningStore } from './morning-store.ts';
import { getBusinessSettings } from './business-settings.ts';
import { startMorningDiscovery } from './morning-run.ts';
import { verifyMorningLeads, draftMorningLeads } from './morning-leads.ts';
import { readContentSourcesNow, generateContentIdeas, reviewMorningOutputs } from './morning-content.ts';
import { saveMorningBrief } from './morning-brief.ts';
function handlers(){return {
 'lead-discovery':async()=>{const kind=morningTime(Date.now()).kind;if(!kind)return {detail:'Sunday has no discovery.'};return {...await startMorningDiscovery(kind as 'side-hustle'|'real-estate'),detail:'Discovery job started. Dataset verification continues in its saved worker.'};},
 'verify-leads':verifyMorningLeads,
 'rico-drafts':draftMorningLeads,
 'content-research':async()=>{const research=await readContentSourcesNow();const ideas=await generateContentIdeas();return {...ideas,sources:research.sources};},
 'quinn-review':reviewMorningOutputs,
 'morning-brief':saveMorningBrief,
};}
export async function runScheduledMorning(now=Date.now()) {
 if(process.env.VERCEL||process.env.HERMES_DEPLOYMENT_MODE==='persistent-host')return {skipped:'Morning pipeline requires the Mac.'};
 const store=openMorningStore();try{return await runTimedMorning({now,enabled:getBusinessSettings().automaticMorningRun,store,handlers:handlers(),nowFn:Date.now,stillEnabled:()=>getBusinessSettings().automaticMorningRun});}finally{store.close();}
}
export async function runManualMorningStep(name:string){
 if(!MORNING_STAGES.some(([id])=>id===name)||name==='lead-discovery')throw Error('Choose a supported step. Use the discovery buttons to approve their exact cost.');
 if(process.env.VERCEL||process.env.HERMES_DEPLOYMENT_MODE==='persistent-host')throw Error('Morning lead/model steps require the Mac.');
 const step=handlers()[name as keyof ReturnType<typeof handlers>];
 return step();
}
