import { body, handle } from '@/lib/server/http';
import { openMorningStore } from '@/lib/server/morning-store';
import { readContentIdeas, readContentSourcesNow, generateContentIdeas, reviewMorningOutputs } from '@/lib/server/morning-content';
import { morningModelConsent } from '@/lib/server/morning-model';
function status(){const store=openMorningStore();try{return {research:store.get('rss',null),ideas:readContentIdeas(),modelConsent:morningModelConsent()};}finally{store.close();}}
export async function GET(){return handle(status);}
export async function POST(req:Request){return handle(async()=>{const input=await body<{action?:string;approveModelCall?:boolean}>(req);
 if(!input.action||input.action==='read')await readContentSourcesNow();
 else {if(input.approveModelCall!==true)throw Error('Approve the displayed subscription call first.');if(input.action==='ideas')await generateContentIdeas();else if(input.action==='review')await reviewMorningOutputs();else throw Error('Unknown research action.');}
 return status();});}
