import { openMorningStore, type createMorningStore } from './morning-store.ts';
type Store=ReturnType<typeof createMorningStore>;
type Brief={day:string;verification?:{researched:number;withEmail:number}|null;ideas:number;steps:{status:string}[]};
export function morningTelegramStatus(store:Store,env=process.env){
 const destination=env.GMAIL_ALERT_TELEGRAM_CHAT_ID||'',configured=!!env.TELEGRAM_BOT_TOKEN&&/^-?\d{5,30}$/.test(destination),approval=store.get<{enabled:boolean;destination:string}|null>('morning-telegram-approval',null),brief=store.get<Brief|null>('morning-brief',null);
 return {configured,destination:configured?destination:null,enabled:!!(configured&&approval?.enabled&&approval.destination===destination),preview:brief?morningTelegramText(brief):'Jordan morning brief: date, researched lead count, public email count, rough idea count and errors. No contact details or drafts included.'};
}
export function morningTelegramText(brief:Brief){return `Jordan morning brief, ${brief.day}\nResearched leads: ${brief.verification?.researched??0}\nWith public email: ${brief.verification?.withEmail??0}\nRough ideas: ${brief.ideas}\nSteps needing attention: ${brief.steps.filter(s=>s.status==='error'||s.status==='running').length}\nReview evidence and approvals in Marcus OS. Nothing has been sent to a lead.`;}
export function approveMorningTelegram(enabled:boolean,approvedDestination?:string){const store=openMorningStore();try{const status=morningTelegramStatus(store);if(enabled&&(!status.configured||approvedDestination!==status.destination))throw Error('Approve the exact configured Telegram chat for morning summaries.');store.set('morning-telegram-approval',{enabled,destination:status.destination||'',at:Date.now()});return morningTelegramStatus(store);}finally{store.close();}}
export async function sendMorningTelegram(store:Store,brief:Brief,fetcher:typeof fetch=fetch,env=process.env){
 const status=morningTelegramStatus(store,env);if(!status.enabled)return {status:'off'};
 if(!store.claimOnce(`morning-telegram:${brief.day}`))return {status:'already-claimed'};
 const key=`morning-telegram-receipt:${brief.day}`;store.set(key,{status:'sending',at:Date.now()});
 try{
  if(!morningTelegramStatus(store,env).enabled){store.set(key,{status:'cancelled',at:Date.now()});return {status:'cancelled'};}
  const response=await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:status.destination,text:morningTelegramText(brief),disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});
  const body=await response.json(),result={status:response.ok&&body.ok===true?'sent':'unknown',at:Date.now()};store.set(key,result);return result;
 }catch{const result={status:'unknown',at:Date.now()};store.set(key,result);return result;}
}
