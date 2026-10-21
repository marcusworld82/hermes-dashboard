'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi } from '@/lib/client';
import { Button, Card, ErrorNote, Page, PageHeader, Badge } from '@/components/ui';
type Item = { id: string; email: string; subject: string; body: string; status: string; kind: string; approvedAt: number; sentAt?: number; error?: string; replyAt?: number; bouncedAt?: number; notBefore: number };
type Queue = { senderEnabled?: boolean; blocked: string | null; paused: boolean; pauseReason?: string; nextReleaseAt?: number; account?: string; items: Item[]; notices: { id: string; text: string; at: number }[] };
export default function OutboxPage() {
  const { data, error, reload } = useApi<Queue>('/api/outbox', 30000);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function action(name: string, id?: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ reason?: string; sent?: boolean }>(name === 'release' ? '/api/outbox/release' : '/api/outbox', { method: 'POST', json: { action: name, id } });
      setMessage(result.reason || (result.sent ? 'One approved email sent.' : 'Queue updated.')); await reload();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Page>
    <PageHeader title="Outbox" sub="Only exact drafts you approved enter this queue. One follow-up needs its own approval." action={<Link href="/settings/gmail" className="underline text-sm">Gmail setup</Link>} />
    <ErrorNote text={error || data?.blocked || null} />
    {message && <p role="status" className="mb-4 text-sm">{message}</p>}
    <Card className="p-5 mb-4 space-y-3">
      <p className="text-sm">{data?.paused ? data.pauseReason || 'Queue paused.' : 'Queue is ready for an approved release.'}</p>
      <p className="text-sm text-gray-600">At least 12 minutes between lead emails, 9 AM to 9 PM New York time. Daily limit and weekends come from Business settings. {data?.senderEnabled ? 'Automatic release is enabled on the Mac worker.' : 'Automatic release is off.'}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !data || !!data.blocked} onClick={() => action(data?.paused ? 'resume' : 'pause')}>{data?.paused ? 'Resume queue' : 'Pause queue'}</Button><Button variant="light" disabled={busy || !data || !!data.blocked || data.paused} onClick={() => action('release')}>Release next approved email</Button></div>
      {!!data?.nextReleaseAt && <p className="text-xs text-gray-600">Next allowed release: {new Date(data.nextReleaseAt).toLocaleString()} or the next open sending window.</p>}
    </Card>
    {data?.notices.map(notice => <p key={notice.id} className="mb-3 p-3 rounded-xl bg-amber-50 text-sm">{notice.text}</p>)}
    {!data?.items.length && <p className="text-sm text-gray-600">No approved emails yet. Review a lead draft in the lead inbox first.</p>}
    {data?.items.map(item => <Card key={item.id} className="p-5 mb-3">
      <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.email}</p><Badge tone={item.status === 'sent' ? 'green' : item.status === 'unknown' ? 'red' : 'gray'}>{item.status}</Badge><Badge>{item.kind}</Badge>{item.replyAt && <Badge tone="blue">Replied</Badge>}{item.bouncedAt && <Badge tone="red">Bounced</Badge>}</div>
      <p className="text-sm mt-2">{item.subject}</p><details className="text-sm mt-2"><summary className="cursor-pointer">View exact approved email</summary><pre className="whitespace-pre-wrap font-sans mt-2">{item.body}</pre></details>
      <p className="text-xs text-gray-500 mt-2">Approved {new Date(item.approvedAt).toLocaleString()}{item.sentAt ? ` · Sent ${new Date(item.sentAt).toLocaleString()}` : ` · Due after ${new Date(item.notBefore).toLocaleString()}`}</p>
      {item.error && <p className="text-sm text-red-700 mt-2">{item.error}</p>}
      {['queued', 'paused'].includes(item.status) && <Button variant="light" size="sm" className="mt-3" disabled={busy} onClick={() => action('cancel', item.id)}>Cancel queued email</Button>}
    </Card>)}
  </Page>;
}
