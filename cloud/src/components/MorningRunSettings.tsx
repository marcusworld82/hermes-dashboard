'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi } from '@/lib/client';
import { Button, Card, ErrorNote } from '@/components/ui';
type Status = { morningTelegram?:{configured:boolean;destination:string|null;enabled:boolean;preview:string}; modelConsent?: {enabled:boolean}; telegram?: { configured: boolean; destination: string | null; enabled: boolean }; blocked: string | null; settings: { automaticMorningRun: boolean; senderEnabled: boolean; dailyScrapeCapUsd: number; dailyEmailLimit: number; weekendSending: boolean }; legacy: { batch: boolean; sender: boolean; error: string | null }; runs: { day: string; claimedAt: number; finishedAt?: number; kind: string | null; steps: { name: string; status: string; detail: string }[] }[]; rss: { checkedAt: number; items: unknown[]; sources: { source: string; status: string; count: number; error?: string }[] } | null; leadSummary?: { checkedAt: string | null; companies: number; people: number; error: string | null }; worker?: { checkedAt: string } | null };
export default function MorningRunSettings() {
  const { data, error, reload } = useApi<Status>('/api/morning-run');
  const [consentMorning, setConsentMorning] = useState(false), [consentSender, setConsentSender] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function toggle(target: 'morning' | 'sender' | 'telegram' | 'models' | 'morning-telegram', enabled: boolean) {
    setBusy(true); setMessage(null);
    try {
      await api('/api/morning-run', { method: 'POST', json: { target, enabled, approvedCalls:3, approvedCapUsd: data?.settings.dailyScrapeCapUsd, approveDailySpend: consentMorning, approvedDailyLimit: data?.settings.dailyEmailLimit, approveApprovedEmailRelease: consentSender, approvedDestination: target==='morning-telegram'?data?.morningTelegram?.destination:data?.telegram?.destination } });
      setConsentMorning(false); setConsentSender(false); await reload(); setMessage(enabled ? 'Activated with your saved limits. The existing Mac worker checks once a minute.' : 'Switched off.');
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  const current = data?.settings;
  return <div className="space-y-4">
    <ErrorNote text={error || data?.blocked || null} />
    {message && <p role="status" className="text-sm">{message}</p>}
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">Automatic morning run</h2>
      <p className="text-sm">{current?.automaticMorningRun ? 'On' : 'Off'}. Runs at 7 AM New York time while this Mac is on. A late start can catch up until 8 AM. Missed mornings are not replayed.</p>
      <p className="text-sm">Monday, Wednesday and Friday: side hustle leads. Tuesday, Thursday and Saturday: real estate leads. Sunday: no lead scrape. Free public source research runs from your enabled sources. Empty sources do nothing.</p>
      <p className="text-sm">Daily scrape cap: ${(current?.dailyScrapeCapUsd ?? .5).toFixed(2)}. The same daily budget is shared with manual discovery. Activation checks the API token, Notion schema, offer settings and current Actor price without starting a paid run.</p>
      {data?.legacy.batch && <p className="text-sm text-amber-800">The old CRM daily batch is on. Turn it off on <a className="underline" href="http://127.0.0.1:3100/autopilot" target="_blank" rel="noreferrer">CRM Autopilot</a> before activating this schedule.</p>}
      {!current?.automaticMorningRun && <label className="flex gap-2 text-sm"><input type="checkbox" checked={consentMorning} onChange={e => setConsentMorning(e.target.checked)} />I approve recurring discovery on the listed days, up to ${(current?.dailyScrapeCapUsd ?? .5).toFixed(2)} per day, until I switch this off.</label>}
      <Button disabled={busy || !data || !!data.blocked || !current?.automaticMorningRun && !consentMorning} onClick={() => toggle('morning', !current?.automaticMorningRun)}>{current?.automaticMorningRun ? 'Turn morning run off' : 'Activate morning run with daily cap'}</Button>
    </Card>
    <Card className="p-5 space-y-3 text-sm">
      <h2 className="font-semibold">Morning drafts and review allowance</h2>
      <p>Schedule: 7:00 discovery, 7:15 verify saved leads, 7:30 Rico drafts, 7:40 source-backed ideas, 7:50 Quinn review, 8:00 brief. Each stage records errors separately. Missed model stages do not replay after 8.</p>
      <p>Separate consent: at most 3 Claude subscription calls per day, shared with the manual buttons. Each stops after 3 minutes with a $0.15 provider ceiling. Verified subscription sign-in is required. Cash usage is not claimed to be zero. No automatic email or publication approval.</p>
      <Button disabled={busy || !data} onClick={() => toggle('models', !data?.modelConsent?.enabled)}>{data?.modelConsent?.enabled ? 'Turn morning model allowance off' : 'Approve up to 3 daily subscription calls'}</Button>
      <div className="flex flex-wrap gap-2">{[['verify-leads','Verify leads now'],['rico-drafts','Use 1 call: Rico drafts'],['quinn-review','Use 1 call: Quinn review'],['morning-brief','Refresh brief']].map(([step,label])=><Button key={step} variant="light" disabled={busy} onClick={async()=>{setBusy(true);setMessage(null);try{await api('/api/morning-run',{method:'POST',json:{target:'step',step,approveModelCall:true}});await reload();setMessage('Step finished. Check saved results.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>{label}</Button>)}</div>
      <Link href="/content-research" className="underline">Read sources and create ideas</Link>
    </Card>
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">Automatic approved email release</h2>
      <p className="text-sm">{current?.senderEnabled ? 'On' : 'Off'}. Sends only exact drafts you already approved, after a verified Gmail self-test and successful reply check. The queue must also be resumed in Outbox.</p>
      <p className="text-sm">Up to {current?.dailyEmailLimit ?? 20} emails per day, 9 AM to 9 PM New York time, {current?.weekendSending ? 'including weekends' : 'weekdays only'}. Each gap is 12 minutes plus 1 to 2 minutes. Pauses, replies, bounces and uncertain sends stop release.</p>
      {data?.legacy.sender && <p className="text-sm text-amber-800">The old CRM sender is on. Turn it off on CRM Autopilot before activating this sender.</p>}
      {!current?.senderEnabled && <label className="flex gap-2 text-sm"><input type="checkbox" checked={consentSender} onChange={e => setConsentSender(e.target.checked)} />I authorize the worker to release my approved queue within these limits until I switch it off.</label>}
      <div className="flex flex-wrap gap-3 items-center"><Button disabled={busy || !data || !!data.blocked || !current?.senderEnabled && !consentSender} onClick={() => toggle('sender', !current?.senderEnabled)}>{current?.senderEnabled ? 'Turn automatic release off' : 'Activate approved email release'}</Button><Link href="/settings/gmail" className="underline text-sm">Gmail setup</Link><Link href="/outbox" className="underline text-sm">Outbox</Link></div>
      <p className="text-xs text-gray-600">Mac required. Cloud sending remains blocked until durable shared storage and an approved cloud scheduler exist. Changing offer, identity or limits requires activation again.</p>
    </Card>
    <Card className="p-5 space-y-3 text-sm">
      <h2 className="font-semibold">Morning Telegram summary</h2>
      <p>Separate consent for one daily summary to chat {data?.morningTelegram?.destination||'not configured'}. Existing queue alert permission does not enable this.</p>
      <pre className="whitespace-pre-wrap text-xs">{data?.morningTelegram?.preview}</pre>
      <Button disabled={busy||!data?.morningTelegram?.configured} onClick={()=>toggle('morning-telegram',!data?.morningTelegram?.enabled)}>{data?.morningTelegram?.enabled?'Turn morning summary off':'Approve daily morning summary to this chat'}</Button>
      <h2 className="font-semibold">Telegram queue alerts</h2>
      <p>{data?.telegram?.configured ? `Configured destination: ${data.telegram.destination}. Only queue pause alerts are sent.` : 'Not configured. Set TELEGRAM_BOT_TOKEN and GMAIL_ALERT_TELEGRAM_CHAT_ID privately on the server.'}</p>
      <Button disabled={busy || !data?.telegram?.configured} onClick={() => toggle('telegram', !data?.telegram?.enabled)}>{data?.telegram?.enabled ? 'Turn Telegram alerts off' : `Approve alerts to chat ${data?.telegram?.destination || 'not configured'}`}</Button>
    </Card>
    <Card className="p-5 space-y-3 text-sm">
      <h2 className="font-semibold">Latest morning evidence</h2>
      <p>Worker last checked: {data?.worker?.checkedAt ? new Date(data.worker.checkedAt).toLocaleString() : 'No saved check yet'}.</p>
      {data?.leadSummary && <p>{data.leadSummary.companies} companies and {data.leadSummary.people} people in the cached master list. Source checked: {data.leadSummary.checkedAt ? new Date(data.leadSummary.checkedAt).toLocaleString() : 'Not checked'}.</p>}
      {data?.rss && <p>{data.rss.items.length} source headlines saved. RSS checked {new Date(data.rss.checkedAt).toLocaleString()}.</p>}
      {data?.runs.slice(0, 3).map(run => <div key={run.day} className="border-t pt-3"><p className="font-medium">{run.day}: {run.kind || 'Sunday, RSS only'}{!run.finishedAt ? ', in progress or awaiting next step' : ''}</p>{run.steps.map(step => <p key={step.name}>{step.name}: {step.status}. {step.detail}</p>)}</div>)}
      {!data?.runs.length && <p>No scheduled morning has run.</p>}
    </Card>
  </div>;
}
