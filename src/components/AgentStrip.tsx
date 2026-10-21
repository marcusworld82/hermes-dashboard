'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useApi, timeAgo} from '@/lib/client';
import {Avatar,Badge,Card,Sheet,ErrorNote} from '@/components/ui';
type Control={paused:boolean;dailyBudgetUsd:number|null;day:string;knownCostUsd:number;reservedUsd:number;unknownCostRuns:number;subscriptionRuns:number;activeRuns:number;lastMessage:string|null;lastRunAt:number|null;scope:string};
type Agent={id:string;name:string;color:string;activity:{status:string;current:{id:string;title:string;board:string}|null;cards:{id:string;title:string;status:string;board:string;result:string}[];cost:null;control?:Control;lastMessages?:{text:string;at:number;threadId:string}[]}};
function status(agent:Agent){return agent.activity.status==='Working'?'Working':agent.activity.control?.activeRuns?'Run status unconfirmed':agent.activity.status;}
export function AgentStrip(){
 const {data,error}=useApi<{agents:Agent[];checkedAt:string;errors:string[]}>('/api/agent-activity',20000);
 const [selected,setSelected]=useState<string|null>(null);
 const agent=data?.agents.find(a=>a.id===selected);const control=agent?.activity.control;
 return <section className="mb-6">
  <div className="flex justify-between mb-3"><h2 className="font-semibold">Your team</h2><Link href="/agents" className="text-sm text-[var(--text-muted)] hover:underline">All agents</Link></div>
  <ErrorNote text={error || data?.errors.join(' ') || null}/>
  <div className="flex gap-3 overflow-x-auto pb-2">
   {data?.agents.map(a=><button key={a.id} onClick={()=>setSelected(a.id)} className="min-w-44 max-w-52 text-left rounded-3xl"><Card className="p-4"><div className="flex gap-3 items-center"><Avatar name={a.name} color={a.color}/><div><p className="font-medium text-sm">{a.name}</p><Badge tone={status(a)==='Working'?'blue':status(a)==='Waiting for you'||status(a)==='Paused'?'amber':'gray'}>{status(a)}</Badge>{a.activity.control?.paused&&<p className="text-[10px] text-[var(--text-muted)] mt-1">New runs paused</p>}</div></div><p className="text-xs text-[var(--text-muted)] mt-3 truncate">{a.activity.current?.title??(a.activity.control?.activeRuns?'Run receipt pending':'No active card found')}</p></Card></button>)}
  </div>
  <Sheet open={!!agent} onClose={()=>setSelected(null)} title={agent?.name??'Agent'}>{agent&&<>
   <Badge>{status(agent)}</Badge>{control?.paused&&<span className="ml-2"><Badge tone="amber">New runs paused</Badge></span>}
   {control&&<Card className="p-4 mt-4"><h3 className="font-medium text-sm">Today · {control.day}</h3><p className="text-sm mt-2">${control.knownCostUsd.toFixed(2)} recorded API cost{control.reservedUsd>0?` · $${control.reservedUsd.toFixed(2)} reserved`:''}</p><p className="text-xs text-[var(--text-muted)] mt-2">{control.dailyBudgetUsd===null?'No API budget set':`$${control.dailyBudgetUsd.toFixed(2)} daily API limit`} · {control.subscriptionRuns} subscription runs · {control.unknownCostRuns} runs with unreported cost</p><p className="text-xs text-[var(--text-muted)] mt-2">{control.scope}</p>{control.activeRuns>0&&<p className="text-xs mt-2">{control.activeRuns} run receipts pending. This does not confirm the process is still running.</p>}{control.lastRunAt&&<p className="text-xs mt-2">Last run {timeAgo(control.lastRunAt / 1000)}</p>}{control.lastMessage&&<p className="text-xs mt-2 whitespace-pre-wrap break-words">{control.lastMessage}</p>}</Card>}
   <h3 className="font-medium text-sm mt-5">Cards and recent results</h3>
   <div className="space-y-3 mt-3">{agent.activity.cards.map(c=><Card key={`${c.board}:${c.id}`} className="p-4"><Link href={`/kanban?board=${encodeURIComponent(c.board)}`} className="font-medium text-sm underline">{c.title}</Link><p className="text-xs my-2">{c.status}</p>{c.result&&<p className="text-xs whitespace-pre-wrap break-words">{c.result}</p>}</Card>)}{!agent.activity.cards.length&&<p className="text-sm text-[var(--text-muted)]">No linked cards found.</p>}</div>
   <h3 className="font-medium text-sm mt-5">Last messages</h3><div className="space-y-3 mt-3">{agent.activity.lastMessages?.map((m,i)=><Link href={`/chat?t=${encodeURIComponent(m.threadId)}`} key={`${m.threadId}:${m.at}:${i}`} className="block rounded-2xl bg-[var(--surface-soft)] p-3"><p className="text-xs text-[var(--text-muted)] mb-2">{timeAgo(m.at / 1000)}</p><p className="text-sm whitespace-pre-wrap break-words">{m.text}</p></Link>)}{!agent.activity.lastMessages?.length&&<p className="text-sm text-[var(--text-muted)]">No saved messages for this agent.</p>}</div>
   <Link href={`/agents/${agent.id}`} className="block underline text-sm mt-5">Profile, pause and budget settings</Link>
  </>}</Sheet>
 </section>;
}
