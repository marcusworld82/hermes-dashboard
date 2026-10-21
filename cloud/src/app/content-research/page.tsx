'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi } from '@/lib/client';
import { Button, Card, ErrorNote, Page, PageHeader } from '@/components/ui';

type Result = { modelConsent?:{enabled:boolean}; ideas?:{checkedAt:number|null;ideas:{id:string;title:string;angle:string;sourceUrl:string;sourceDate:string|null;sourceQuote:string;status:string;review?:{decision:string;reason:string}}[]}; research: null | { checkedAt: number; noSources: boolean; items: { title: string; link: string; source: string; publishedAt: string | null }[]; sources: { id: string; source: string; status: string; count: number; error?: string }[] } };
export default function ContentResearchPage() {
  const { data, setData, error } = useApi<Result>('/api/content-research');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function refresh(action='read') {
    setBusy(true); setMessage(null);
    try { setData(await api<Result>('/api/content-research', { method: 'POST', json: {action,approveModelCall:action!=='read'} })); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Page>
    <PageHeader title="Content research" sub="Observed sources and rough ideas awaiting your review." />
    <ErrorNote text={error || message} />
    <Card className="p-5 mb-5">
      <p className="text-sm mb-4">Reads RSS, Reddit feeds, YouTube channel feeds resolved from public metadata and readable public website text. This read does not call a model. X and Instagram require approved connectors. Headline-only sources cannot generate ideas.</p>
      <div className="flex gap-4 items-center"><Button onClick={() => refresh()} disabled={busy}>{busy ? 'Reading sources…' : 'Read sources now'}</Button><Button variant="light" disabled={busy || !data?.modelConsent?.enabled} onClick={() => refresh('ideas')}>Use 1 subscription call: create ideas</Button><Button variant="light" disabled={busy || !data?.modelConsent?.enabled} onClick={() => refresh('review')}>Use 1 subscription call: Quinn review</Button><Link href="/settings/research" className="text-sm underline">Edit sources</Link></div>
      {data?.research && <p className="text-xs text-[var(--text-muted)] mt-4">Last read {new Date(data.research.checkedAt).toLocaleString()}. Headlines are source material, not checked claims or approved content.</p>}
    </Card>
    {!data?.modelConsent?.enabled && <p className="text-sm mb-4">Model steps are off. Approve the separate daily allowance in <Link href="/settings" className="underline">Settings</Link> first.</p>}
    {!!data?.ideas?.ideas.length && <section className="space-y-3 mb-6"><h2 className="font-semibold">Saved rough ideas, {data.ideas.ideas.length}</h2>{data.ideas.ideas.map(idea=><Card key={idea.id} className="p-5 space-y-2"><h3 className="font-medium">{idea.title}</h3><p className="text-sm whitespace-pre-wrap">{idea.angle}</p><blockquote className="text-sm border-l-2 pl-3">{idea.sourceQuote}</blockquote><a href={idea.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Source, {idea.sourceDate ? new Date(idea.sourceDate).toLocaleDateString() : 'publication date unknown'}</a><p className="text-xs">{idea.review ? `${idea.review.decision}: ${idea.review.reason}` : 'Quinn review pending. Human approval required.'}</p><Link href={`/social?source=${encodeURIComponent(idea.sourceUrl)}`} className="text-sm underline">Open Content Machine</Link></Card>)}</section>}
    {!data?.research?.items.length && <Card className="p-6"><p className="text-sm">{data?.research?.noSources ? 'Add and enable your sources to begin.' : 'No source headlines saved yet.'}</p></Card>}
    <div className="grid md:grid-cols-2 gap-3">{data?.research?.items.map((item, i) => <Card key={`${item.link}-${i}`} className="p-5">
      <a href={item.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">{item.title}</a>
      <p className="text-xs text-[var(--text-muted)] mt-3">{item.source} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Publish date unavailable'}</p>
      <Link href={`/social?source=${encodeURIComponent(item.link)}`} className="inline-block text-xs underline mt-3">Open Content Machine</Link>
    </Card>)}</div>
    {data?.research?.sources.some(s => s.error) && <Card className="p-5 mt-5"><p className="font-medium text-sm mb-3">Source results</p>{data.research.sources.filter(s => s.error).map(s => <p className="text-sm mt-2 break-words" key={s.id}>{s.source}: {s.error}</p>)}</Card>}
  </Page>;
}
