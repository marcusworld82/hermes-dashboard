import {readJson,updateJson} from './store.ts';
import {prospectLibrary} from './prospect-library.ts';
import {claudeSend} from './models.ts';
import {requireRuns} from './settings.ts';
import {buildKit,fetchSite,leadHash,needsKit,readPlaybook,type Kit,type KitDeps,type KitLead} from './outreach-kit.ts';

// Stores kits in data/outreach-kits.json and fills them in a few at a time, so new prospects get scripts automatically.
const FILE='outreach-kits';
const PER_TICK=Number(process.env.OUTREACH_KIT_PER_TICK||1);
const DAILY_CAP=Number(process.env.OUTREACH_KIT_DAILY_CAP||40);

const homeCity=()=>process.env.OUTREACH_HOME_CITY||'';
// Kits refresh when the playbook or home city changes.
const hashKey=()=>readPlaybook()+homeCity();
const deps=():KitDeps=>({send:p=>claudeSend(p,{agentId:'rico'}),fetchSite,playbook:readPlaybook,homeCity:homeCity()});
export const readKits=()=>readJson<Record<string,Kit>>(FILE,{});
const save=(kit:Kit)=>updateJson<Record<string,Kit>>(FILE,{},all=>{all[kit.leadId]=kit;});
const leads=()=>prospectLibrary().prospects as unknown as KitLead[];

// A prospect whose kit failed is not retried automatically until its details change. Regenerate retries by hand.
const failedHash=new Map<string,string>();
let busy=false,last:{at:string;made:number;failed:number}|null=null;
// Starts a batch in the background and returns at once, so the worker's other checks are not held up by Claude.
export function startKitBatch(){
 requireRuns();
 if(busy)return {started:false,reason:'already running',last};
 void runKitBatch().catch(()=>{});
 return {started:true,last};
}
export async function runKitBatch(){
 requireRuns();
 if(busy)return {skipped:true,reason:'already running'};
 const kits=readKits();const today=new Date().toISOString().slice(0,10);
 const madeToday=Object.values(kits).filter(k=>k.createdAt.startsWith(today)).length;
 if(madeToday>=DAILY_CAP)return {skipped:true,reason:`daily cap of ${DAILY_CAP} kits reached`};
 const playbook=hashKey();
 const queue=needsKit(leads(),kits,playbook).filter(l=>failedHash.get(l.id)!==leadHash(l,playbook)).slice(0,Math.min(PER_TICK,DAILY_CAP-madeToday));
 busy=true;const made:string[]=[],failed:string[]=[];
 try{for(const l of queue){try{save(await buildKit(l,deps()));made.push(l.id);}catch{failed.push(l.id);failedHash.set(l.id,leadHash(l,playbook));}}}
 finally{busy=false;last={at:new Date().toISOString(),made:made.length,failed:failed.length};}
 return {made:made.length,failed:failed.length,waiting:Math.max(0,needsKit(leads(),readKits(),hashKey()).length)};
}

export async function regenerateKit(id:string){
 requireRuns();
 const lead=leads().find(l=>l.id===id);if(!lead)throw Error('Prospect not found.');
 const kit=await buildKit(lead,deps());save(kit);return kit;
}
