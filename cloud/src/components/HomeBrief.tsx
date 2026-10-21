'use client';

import Link from 'next/link';
import { useApi } from '@/lib/client';
import { Badge, Card, ErrorNote } from '@/components/ui';

type Brief = {
  contentIdeas: {checkedAt:number|null;ideas:{id:string;title:string;sourceUrl:string;sourceDate:string|null;review?:{decision:string;reason:string}}[]};
  leads: {readyToReview:number;needsContact:number;checkedAt:string|null;error:string|null;replies:{id:string;name:string}[];drafts:{id:string;name:string}[]};
  clients: { counts: { open: number; dueThisWeek: number; overdue: number }; checkedAt: string | null; error: string | null };
  morning: { enabled: boolean; runs: { day: string; steps: { name: string; status: string; detail: string }[] }[]; rss: { items: { title: string; link: string }[] } | null };
  mail: { queued: number; replied: number; uncertain: number; paused: boolean; pauseReason: string | null; notices: { id: string; at: number; text: string }[] };
};

export function HomeBrief() {
  const { data, error } = useApi<Brief>('/api/home-brief', 30000);
  if (!data) return <ErrorNote text={error} />;
  const latest = data.morning.runs[0];
  return <section className="mb-6">
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold">Your daily brief</h2>
      <Link href="/settings" className="text-xs text-[var(--text-muted)]">Morning run {data.morning.enabled ? 'on' : 'off'}</Link>
    </div>
    <ErrorNote text={error || data.clients.error || data.leads.error} />
    <div className="grid md:grid-cols-3 gap-3">
      <Link href="/outbox"><Card className="p-5 h-full">
        <p className="text-xs text-[var(--text-muted)]">Outreach</p>
        <p className="text-2xl font-semibold mt-2">{data.mail.queued} <span className="text-sm font-normal">approved and waiting</span></p>
        <p className="text-sm mt-2">{data.mail.replied} replies · {data.mail.uncertain} uncertain sends</p>
        {data.mail.paused && <p className="text-xs text-[var(--text-muted)] mt-3">Paused. {data.mail.pauseReason}</p>}
      </Card></Link>
      <Link href="/clients"><Card className="p-5 h-full">
        <p className="text-xs text-[var(--text-muted)]">Client work</p>
        <p className="text-2xl font-semibold mt-2">{data.clients.checkedAt ? data.clients.counts.open : 'Not checked'} <span className="text-sm font-normal">{data.clients.checkedAt ? 'open clients' : ''}</span></p>
        <p className="text-sm mt-2">{data.clients.counts.dueThisWeek} deliverables due this week · {data.clients.counts.overdue} overdue</p>
      </Card></Link>
      <Card className="p-5">
        <p className="text-xs text-[var(--text-muted)]">Morning evidence</p>
        {latest ? <><p className="font-medium mt-2">{latest.day}</p>{latest.steps.map(step => <p key={step.name} className="text-xs mt-2"><Badge tone={step.status === 'error' ? 'red' : 'gray'}>{step.status}</Badge> {step.name}: {step.detail}</p>)}</> : <p className="text-sm mt-3">No scheduled morning has run.</p>}
        <Link href="/content-research" className="text-sm underline block mt-3">{data.morning.rss?.items.length ?? 0} saved source headlines</Link>
      </Card>
    </div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
      <Link href="/leads"><Card className="p-5"><p className="text-xs text-[var(--text-muted)]">Drafts to review</p><p className="text-2xl font-semibold mt-2">{data.leads.checkedAt ? data.leads.readyToReview : 'Not checked'}</p><p className="text-xs text-[var(--text-muted)] mt-2">{data.leads.needsContact} need a public email. Every send checks the live Notion record.</p>{data.leads.drafts.slice(0,3).map(d=><p key={d.id} className="text-sm mt-2 truncate">{d.name}</p>)}</Card></Link>
      <Link href="/leads"><Card className="p-5"><p className="text-xs text-[var(--text-muted)]">Replies in the lead master</p><p className="text-2xl font-semibold mt-2">{data.leads.checkedAt ? data.leads.replies.length : 'Not checked'}</p>{data.leads.replies.slice(0,3).map(r=><p key={r.id} className="text-sm mt-2 truncate">{r.name}</p>)}<p className="text-xs text-[var(--text-muted)] mt-2">Open the lead inbox to review and update the next step.</p></Card></Link>
      <Link href="/content-research"><Card className="p-5 h-full"><p className="text-xs text-[var(--text-muted)]">Source-backed content ideas</p><p className="text-2xl font-semibold mt-2">{data.contentIdeas.ideas.length}</p>{data.contentIdeas.ideas.slice(0,3).map(i=><p key={i.id} className="text-sm mt-2 truncate">{i.title}</p>)}<p className="text-xs text-[var(--text-muted)] mt-2">Rough ideas for your review.{data.contentIdeas.checkedAt ? ` Saved ${new Date(data.contentIdeas.checkedAt).toLocaleDateString()}.` : ' Add sources in Settings to begin.'}</p></Card></Link>
    </div>
    {data.mail.notices.length > 0 && <Card className="p-4 mt-3"><h3 className="text-sm font-medium mb-2">Mail updates</h3>{data.mail.notices.map(notice => <p key={notice.id} className="text-sm mt-2">{notice.text}</p>)}</Card>}
  </section>;
}
