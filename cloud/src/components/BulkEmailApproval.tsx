'use client';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/client';
import type { BulkPreviewRow, BulkApprovalRow } from '@/lib/types/bulk-email';

export function BulkEmailApproval({ available, onApproved }: { available: Array<{ id: string; name: string }>; onApproved?: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<'first' | 'followup'>('first');
  const [rows, setRows] = useState<BulkPreviewRow[]>([]);
  const [results, setResults] = useState<BulkApprovalRow[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = rows.filter(row => !row.error && row.draftHash);
  const reset = () => { setRows([]); setResults([]); setReviewed(false); setError(''); };
  async function preview() {
    setBusy(true); reset();
    try { setRows((await api<{ rows: BulkPreviewRow[] }>('/api/outbox/bulk', { method: 'POST', json: { action: 'preview', ids: selected, kind } })).rows); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true); setError('');
    try {
      const result = await api<{ rows: BulkApprovalRow[] }>('/api/outbox/bulk', { method: 'POST', json: { action: 'approve', reviewedAll: reviewed, items: ready.map(row => ({ id: row.id, kind: row.kind, approvedHash: row.draftHash })) } });
      setResults(result.rows); setRows([]); setReviewed(false); onApproved?.();
    } catch (e) { setError(`${(e as Error).message} Check the outbox before retrying. Some approvals may have completed.`); setRows([]); setReviewed(false); }
    finally { setBusy(false); }
  }
  const name = (id: string) => available.find(row => row.id === id)?.name || id;
  return <Card className="p-5 space-y-4">
    <h2 className="font-semibold">Review and approve multiple emails</h2>
    <p className="text-sm text-[#6b7280]">Choose up to 30 leads. Approval adds exact emails to the queue. The queue follows its current pause state and sending schedule.</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Email step <select value={kind} onChange={e => { setKind(e.target.value as 'first' | 'followup'); reset(); }} className="ml-2 rounded-lg border p-2"><option value="first">First email</option><option value="followup">Follow-up</option></select></label>
      <div className="max-h-56 overflow-y-auto space-y-2">
        {available.map(lead => <label key={lead.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(lead.id)} disabled={!selected.includes(lead.id) && selected.length >= 30} onChange={e => { setSelected(current => e.target.checked ? [...current, lead.id] : current.filter(id => id !== lead.id)); reset(); }} />{lead.name}</label>)}
        {!available.length && <p className="text-sm">No leads in the current list.</p>}
      </div>
      <Button onClick={preview} disabled={!selected.length || busy}>Preview {selected.length} emails</Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {rows.map(row => <section key={row.id} className="border rounded-xl p-4 space-y-2">
      <h3 className="font-medium">{name(row.id)}</h3>
      {row.error ? <p className="text-sm text-red-500">Not eligible: {row.error}</p> : <><p className="text-sm break-all">To: {row.email}</p><p className="text-sm">Subject: {row.subject}</p><div className="whitespace-pre-wrap break-words text-sm">{row.body}</div></>}
    </section>)}
    {!!ready.length && <div className="space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />I reviewed every complete email above, including recipients, subjects and signatures.</label><Button disabled={!reviewed || busy} onClick={approve}>Approve {ready.length} exact emails for queue</Button></div>}
    {!!results.length && <div role="status" className="space-y-2 text-sm"><p>{results.filter(row => row.queued).length} queued. {results.filter(row => !row.queued).length} not queued.</p>{results.map(row => <p key={row.id}>{name(row.id)}: {row.queued ? 'Queued' : row.error}</p>)}</div>}
    {busy && <p role="status" className="text-sm">Checking selected emails...</p>}
  </Card>;
}
