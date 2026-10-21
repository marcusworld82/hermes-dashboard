'use client';
import {useState} from 'react';
import {api,useApi} from '@/lib/client';
import {ErrorNote} from '@/components/ui';

// Call sheet, email and DM script for one prospect, written from the cold outreach playbook and what the research found.
type Kit={niche:string;findings:{key:string;text:string;source:string}[];channels:{call:boolean;email:boolean;dm:boolean};call:{opener:string;localHook:string;questions:string[];gapLine:string;showLine:string;objections:{they:string;you:string}[]};email:{subject:string;body:string;followUps:string[]};dm:{messages:string[]};flags:string[];createdAt:string};
const NICHE:Record<string,string>={local_service:'Website prospect',real_estate_agent:'Real estate agent',brokerage:'Brokerage',str_host:'Short-term rental host'};
const button='px-4 py-2 rounded-xl border bg-white text-sm font-medium';

function Copy({text}:{text:string}){
 const [done,setDone]=useState(false);
 return <button className="text-xs underline text-gray-500" onClick={()=>{void navigator.clipboard.writeText(text).then(()=>{setDone(true);setTimeout(()=>setDone(false),1500);});}}>{done?'Copied':'Copy'}</button>;
}
function Block({title,text}:{title:string;text:string}){
 if(!text)return null;
 return <div className="rounded-xl border p-4"><div className="flex justify-between mb-2"><p className="text-sm text-gray-500">{title}</p><Copy text={text}/></div><p className="whitespace-pre-wrap leading-7">{text}</p></div>;
}

export function OutreachKit({id}:{id:string}){
 const {data,error,reload}=useApi<{kit:Kit|null}>(`/api/connections/prospects/kits?id=${encodeURIComponent(id)}`,20000);
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState<string|null>(null);
 const regen=async()=>{setBusy(true);setMsg(null);try{await api('/api/connections/prospects/kits',{method:'POST',json:{action:'regenerate',id}});reload();}catch(e){setMsg((e as Error).message);}finally{setBusy(false);}};
 const kit=data?.kit;
 const regenButton=<button disabled={busy} className={button} onClick={regen}>{busy?'Writing scripts…':kit?'Rewrite scripts':'Write scripts now'}</button>;
 if(!kit)return <div className="space-y-3"><ErrorNote text={error||msg}/><p className="p-5 bg-gray-50 rounded-xl">No scripts yet. New prospects get them automatically within a few minutes while agent runs are on.</p>{regenButton}</div>;
 const c=kit.call;
 const callSheet=[c.opener,c.localHook,'Questions:\n'+c.questions.map(q=>'- '+q).join('\n'),'Ask: "Is it cool if I tell you a little about what I do?"',c.gapLine,c.showLine].filter(Boolean).join('\n\n');
 return <div className="space-y-6">
  <ErrorNote text={msg}/>
  <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-500">{NICHE[kit.niche]||kit.niche} · written {new Date(kit.createdAt).toLocaleString()}</p>{regenButton}</div>
  {kit.flags.map(f=><p key={f} className="p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">{f}</p>)}
  <section><h3 className="font-semibold mb-2">What we found</h3>{kit.findings.length?<ul className="space-y-1 text-sm">{kit.findings.map(f=><li key={f.key}>{f.text} <span className="text-gray-400">({/^https?:/.test(f.source)?<a className="underline" href={f.source} target="_blank" rel="noreferrer">source</a>:f.source})</span></li>)}</ul>:<p className="text-sm text-gray-500">No specific gaps found.</p>}</section>
  <section className="space-y-3"><div className="flex justify-between"><h3 className="font-semibold">Call sheet {kit.channels.call?'':'(no phone yet)'}</h3><Copy text={callSheet}/></div>
   <Block title="Opener" text={c.opener}/><Block title="Local connection" text={c.localHook}/>
   {c.questions.length>0&&<div className="rounded-xl border p-4"><p className="text-sm text-gray-500 mb-2">Let them talk. Pick two or three.</p><ul className="list-disc pl-5 space-y-1">{c.questions.map(q=><li key={q}>{q}</li>)}</ul></div>}
   <p className="text-sm px-1">Then ask: &quot;Is it cool if I tell you a little about what I do?&quot;</p>
   <Block title="Tell them straight" text={c.gapLine}/><Block title="Show, don't sell" text={c.showLine}/>
   {c.objections.length>0&&<div className="rounded-xl border p-4"><p className="text-sm text-gray-500 mb-2">If they say</p><div className="space-y-3">{c.objections.map(o=><div key={o.they}><p className="font-medium">&quot;{o.they}&quot;</p><p className="text-gray-700">{o.you}</p></div>)}</div></div>}
  </section>
  <section className="space-y-3"><h3 className="font-semibold">Cold email {kit.channels.email?'':'(no email yet)'}</h3><Block title={`Subject: ${kit.email.subject}`} text={kit.email.body}/>{kit.email.followUps.map((f,i)=><Block key={i} title={`Follow-up ${i+1} (${i===0?'3':'7'} days later)`} text={f}/>)}<p className="text-xs text-gray-500">Draft only. Paste into your email tool or the Email tab flow to send.</p></section>
  <section className="space-y-3"><h3 className="font-semibold">DM script {kit.channels.dm?'':'(no social found yet)'}</h3>{kit.dm.messages.map((m,i)=><Block key={i} title={`Message ${i+1}`} text={m}/>)}<p className="text-xs text-gray-500">Send by hand from your own account. Comment on one of their posts first.</p></section>
 </div>;
}
