'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api,useApi} from '@/lib/client';
import {Button,Card,ErrorNote,Page,PageHeader} from '@/components/ui';
import type {DiscoveryJob,DiscoveryPlan} from '@/lib/types/discovery';
type Status={disabledReason:string|null;dailyCapUsd:number;accountedUsd:number|null;jobs:DiscoveryJob[]};
type Quote={id:string;plan:DiscoveryPlan;expiresAt:number};
export default function DiscoveryPage(){
 const {data,error,reload}=useApi<Status>('/api/discovery');
 const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{const timer=setInterval(reload,5000);return()=>clearInterval(timer);},[reload]);
 async function act(body:Record<string,unknown>){setBusy(true);setFailure(null);try{const result=await api<Quote>('/api/discovery',{method:'POST',json:body});if(body.action==='quote')setQuote(result);else setQuote(null);reload();}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}
 return <Page><PageHeader title="Find leads" sub="Runs on this Mac. Research only. Nothing here sends a message."/><ErrorNote text={error||failure}/>
 <Card className="p-5 mb-4"><p className="font-medium">Daily maximum: ${(data?.dailyCapUsd??.5).toFixed(2)}</p><p className="text-sm text-gray-600 mt-2">Spent or reserved today: {data?.accountedUsd==null?'Unknown':`$${data.accountedUsd.toFixed(2)}`}. Both buttons share this local budget.</p><p className="text-sm mt-2">Target: at least 20 researched companies per run, with up to 60 raw results inside the cap. Duplicate advertisers and missing evidence can reduce the final count.</p><Link className="text-sm underline" href="/settings/research">Edit niche, services and location</Link></Card>
 {data?.disabledReason&&<p className="mb-4 text-sm text-amber-800">{data.disabledReason}</p>}
 <div className="flex flex-wrap gap-3 mb-4"><Button disabled={busy||!!data?.disabledReason} onClick={()=>act({action:'quote',kind:'side-hustle'})}>Side hustle leads: show cost</Button><Button disabled={busy||!!data?.disabledReason} onClick={()=>act({action:'quote',kind:'real-estate'})}>Real estate leads: show cost</Button></div>
 {quote&&<Card className="p-5 mb-4"><p>Estimated cost: ${quote.plan.estimateUsd.toFixed(4)}. Maximum reserved: ${quote.plan.reservedCapUsd.toFixed(2)}.</p><p className="text-sm my-2">{quote.plan.note} Current Actor schema and pricing checked at {new Date(quote.plan.verifiedAt).toLocaleTimeString()}.</p><Button disabled={busy} onClick={()=>act({action:'start',id:quote.id,approvedCapUsd:quote.plan.reservedCapUsd})}>Approve up to ${quote.plan.reservedCapUsd.toFixed(2)} and run</Button></Card>}
 <div className="space-y-3">{data?.jobs.map(job=><Card key={job.id} className="p-5"><div className="flex justify-between gap-3"><p className="font-medium">{job.plan.kind==='real-estate'?'Real estate':'Side hustle'} leads</p><span className="text-sm">{job.phase}</span></div><p className="text-sm mt-2">Found {job.found??0} of {job.plan.target} target leads. {job.actualUsd==null?'Final cost not yet reported.':`Reported cost: $${job.actualUsd.toFixed(4)}.`}</p>{job.runId&&<p className="text-xs mt-2 break-all">Apify run: {job.runId}</p>}{job.error&&<p className="text-sm mt-2 text-red-700">{job.error}</p>}{job.phase==='awaiting-sync'&&!job.error&&<p className="text-sm mt-2">Saving to Notion and refreshing Marcus OS...</p>}{job.phase==='awaiting-sync'&&job.error&&<Button disabled={busy} onClick={()=>act({action:'sync',id:job.id})}>Retry Notion sync</Button>}{job.runId&&['failed','polling','building'].includes(job.phase)&&<Button disabled={busy} onClick={()=>act({action:'resume',id:job.id})}>Resume saved run</Button>}{job.phase==='complete'&&<Link className="text-sm underline" href="/lead-research">Open the lead list</Link>}</Card>)}</div>
 </Page>;
}
