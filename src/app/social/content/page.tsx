"use client";
/* eslint-disable @next/next/no-img-element -- protected workspace assets use local API URLs */

import { useState } from "react";
import { Plus, RefreshCw, Loader2, Film, CheckCircle2, Upload, ArrowRight } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { PostOptions, defaultPostOptions, sendableOptions, type PostOptionsValue } from "@/components/social/PostOptions";
import { Badge, Button, Card, Empty, ErrorNote, Field, Page, PageHeader, inputCls, cx } from "@/components/ui";

type Style = { id: string; name: string; description?: string; available: boolean; note?: string };
type Sources = { githubSearch: string[]; githubReleases: string[]; redditSubs: string[]; feeds: string[]; youtubeChannels: string[]; xUrls: string[]; scrapeUrls: string[] };
type Piece = {
  id: string; title: string; topic: string; styleId: string; status: string; script: string; caption: string;
  brief: string; coverPrompt: string; sourceUrls: string[]; assets: { recording?: string; video?: string; cover?: string };
  logs: { at: string; text: string }[]; updatedAt: string; revision: number; error?: string | null;
  scriptApprovedRevision?: number; research?: { title?: string; url?: string; summary?: string; source?: string; failure?: string }[];
  tasks?: { stage: string; status: string; error?: string }[];
  publication?: {state: string; error?: string; receipts?: Record<string, string>};
  approval?: { channelIds?: string[]; when?: string; revision?: number; options?: PostOptionsValue } | null;
};
type Registry = { pieces: Piece[]; styles: Style[]; sources: Sources; worker: { online: boolean; lastSeen?: string; busy?: boolean; note?: string } };
type Channels = { ready: boolean; channels: { id: string; name: string; identifier: string }[]; reason?: string };
const BASE = "/api/social/content";
const active = (status: string) => /queued|researching|scripting|rendering|building|running|cover_pending/.test(status);
const localTime = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const message = (e: unknown) => e instanceof Error ? e.message : "The request failed. Try again.";

type MorningIdeas={ideas:{ideas:{id:string;title:string;angle:string;sourceUrl:string;sourceQuote:string;sourceDate:string|null;review?:{decision:string;reason:string}}[]}};
function MorningIdeaShelf(){const {data,error}=useApi<MorningIdeas>('/api/content-research');return <Card className="p-5 mb-5"><details><summary className="font-medium cursor-pointer">Source-backed rough ideas ({data?.ideas?.ideas.length||0})</summary><ErrorNote text={error}/><p className="text-sm mt-3">Ideas remain unapproved. Review their evidence and create a workspace only when the angle fits.</p><a href="/content-research" className="text-sm underline">Read sources, create ideas and request Quinn review</a>{data?.ideas?.ideas.map(idea=><article key={idea.id} className="border-t mt-3 pt-3 space-y-2"><h3 className="font-medium">{idea.title}</h3><p className="text-sm">{idea.angle}</p><blockquote className="text-sm border-l-2 pl-3">{idea.sourceQuote}</blockquote><a href={idea.sourceUrl} target="_blank" rel="noreferrer" className="text-xs underline">Source, {idea.sourceDate?new Date(idea.sourceDate).toLocaleDateString():'publication date unknown'}</a><p className="text-xs">{idea.review?`${idea.review.decision}: ${idea.review.reason}`:'Review pending'}</p></article>)}</details></Card>;}

export default function ContentPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [poll, setPoll] = useState(false);
  const list = useApi<Registry>(BASE, poll ? 4000 : 15000);
  const data = list.data;
  const piece = data?.pieces.find(p => p.id === selected);
  const select = (p: Piece) => { setSelected(p.id); setPoll(active(p.status)); };
  async function create() {
    setBusy(true); setError(null);
    try {
      const result = await api<{ piece: Piece }>(BASE, { method: "POST", json: { title: title.trim(), topic: title.trim(), styleId: data?.styles.find(s => s.available)?.id || "" } });
      await list.reload(); select(result.piece); setTitle("");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <Page wide>
    <PageHeader title="Content Machine" sub="Research an idea, write in your voice, build a Reel and review the exact post." action={<Button variant="light" onClick={() => void list.reload()}><RefreshCw size={14} /> Refresh</Button>} />
    <ErrorNote text={error || list.error} />
    <MorningIdeaShelf />
    <div className="flex gap-2 items-center flex-wrap mb-5">
      <Badge tone={data?.worker.online ? "green" : "amber"}>{data?.worker.online ? "Production worker online" : "Production worker offline"}</Badge>
      {data?.worker.busy && <Badge tone="blue">Worker busy</Badge>}
      <span className="text-xs text-[#6b7280]">{data?.worker.note || "Your Mac handles recording analysis and rendering."}</span>
    </div>
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
      <div className="space-y-4">
        <Card className="p-4">
          <label className="text-sm font-medium" htmlFor="new-reel">New Reel</label>
          <input id="new-reel" className={cx(inputCls, "my-3")} value={title} onChange={e => setTitle(e.target.value)} placeholder="Topic or working title" onKeyDown={e => { if (e.key === "Enter" && title.trim() && !busy) void create(); }} />
          <Button className="w-full" disabled={busy || !title.trim() || !data} onClick={() => void create()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create workspace</Button>
        </Card>
        <Card className="p-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280] px-3 py-2">Your Reels</p>
          {data?.pieces.length === 0 && <p className="p-3 text-sm text-[#6b7280]">Create your first workspace above.</p>}
          {data?.pieces.map(p => <button key={p.id} onClick={() => select(p)} className={cx("w-full text-left p-3 rounded-2xl mb-1", selected === p.id ? "bg-[#f0f2f5]" : "hover:bg-[#fafbfc]")}><p className="text-sm font-medium truncate">{p.title || "Untitled Reel"}</p><Badge className="mt-1" tone={p.status === "scheduled" ? "green" : active(p.status) ? "blue" : "gray"}>{p.status.replaceAll("_", " ")}</Badge></button>)}
        </Card>
        {data && <SourceSettings key={JSON.stringify(data.sources)} sources={data.sources} onSaved={list.reload} />}
      </div>
      {piece && data ? <Workspace key={piece.id} piece={piece} styles={data.styles} online={data.worker.online} onRefresh={list.reload} onActive={() => setPoll(true)} /> : <Card><Empty title={list.loading ? "Loading your workspaces" : "One home for each Reel"} sub="Choose a Reel or create one. Your script, recording, style, cover and posting approval stay together." action={<Film size={32} className="text-[#9ca3af]" />} /></Card>}
    </div>
  </Page>;
}

function Workspace({ piece, styles, online, onRefresh, onActive }: { piece: Piece; styles: Style[]; online: boolean; onRefresh: () => Promise<void>; onActive: () => void }) {
  const [edits, setEdits] = useState<Partial<Piece>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>(piece.approval?.channelIds || []);
  const [when, setWhen] = useState(localTime(piece.approval?.when));
  const [opts, setOpts] = useState<PostOptionsValue>(() => piece.approval?.options ? { ...defaultPostOptions(), ...piece.approval.options, comments: [...(piece.approval.options.comments ?? []), "", ""].slice(0, 2) } : defaultPostOptions());
  const [reviewed, setReviewed] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const channels = useApi<Channels>("/api/social/postiz/channels");
  const p = { ...piece, ...edits };
  const dirty = Object.keys(edits).length > 0;
  const running = active(piece.status);
  const locked = !!busy || running || !!piece.publication || ["scheduled", "published", "posted"].includes(piece.status);
  const style = styles.find(s => s.id === p.styleId);
  const changed = <K extends keyof Piece>(key: K, value: Piece[K]) => { setEdits(e => ({ ...e, [key]: value })); setReviewed(false); };
  const asset = (kind: string) => `${BASE}/${p.id}/asset?kind=${kind}&v=${p.revision}`;
  const iso = when && Number.isFinite(new Date(when).getTime()) ? new Date(when).toISOString() : "";
  const validSchedule = !!iso && new Date(iso).getTime() > clock + 60000 && channelIds.length > 0;
  const approvedSelection = !!p.approval && JSON.stringify([...(p.approval.channelIds || [])].sort()) === JSON.stringify([...channelIds].sort()) && p.approval.when === iso && JSON.stringify(p.approval.options ?? null) === JSON.stringify(sendableOptions(opts));
  const complete = !!p.assets.video && !!p.assets.cover && !!p.caption.trim();
  async function save() {
    setBusy("save"); setError(null);
    try { await api(`${BASE}/${p.id}`, { method: "PATCH", json: { ...edits, ...(edits.sourceUrls ? { sourceUrls: edits.sourceUrls.map(u => u.trim()).filter(Boolean) } : {}) } }); setEdits({}); setReviewed(false); await onRefresh(); setNotice("Changes saved. Review approval must be renewed after edits."); }
    catch (e) { setError(message(e)); } finally { setBusy(null); }
  }
  async function action(name: string, outcome?: "scheduled" | "not-posted") {
    setBusy(name); setError(null); setNotice("");
    try {
      const result = await api<{piece: Piece}>(`${BASE}/${p.id}`, { method: "POST", json: { action: name, ...(outcome ? { outcome } : {}), ...(name === "approve" || name === "schedule" ? { channelIds, when: iso, options: sendableOptions(opts) } : {}) } });
      if (name === "resolve-publication") setReviewed(false);
      onActive(); await onRefresh();
      if (result.piece.publication?.state === "uncertain" || result.piece.publication?.state === "failed") throw new Error(result.piece.publication.error || "Posting was not confirmed. Check Postiz before retrying.");
      setNotice(name === "resolve-publication" ? (outcome === "scheduled" ? "Marked scheduled after your Postiz check." : "Publication hold cleared. Review and approve the package again before scheduling.") : name === "cover" ? "Cover handoff requested. Follow its worker notes below and upload the finished cover." : name === "schedule" ? "Scheduling request completed. Check the saved status below." : "Request saved. Progress and results appear here.");
    } catch (e) { setError(message(e)); } finally { setBusy(null); }
  }
  async function upload(file: File, kind: "recording" | "cover" | "video") {
    setBusy(`upload-${kind}`); setError(null); setNotice("");
    const uploadId = crypto.randomUUID(); const size = 512 * 1024; const total = Math.ceil(file.size / size);
    try {
      if (!total) throw new Error("This file is empty.");
      for (let index = 0; index < total; index++) {
        const bytes = new Uint8Array(await file.slice(index * size, (index + 1) * size).arrayBuffer());
        let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        await api(`${BASE}/${p.id}/upload`, { method: "POST", json: { kind, uploadId, index, total, name: file.name, mime: file.type || (kind === "cover" ? "image/png" : "video/mp4"), data: btoa(binary) } });
        setNotice(`Uploading ${kind}: ${Math.round((index + 1) / total * 100)}%`);
      }
      setReviewed(false); await onRefresh(); setNotice(`${kind === "recording" ? "Recording" : kind === "cover" ? "Cover" : "Video"} uploaded.`);
    } catch (e) { setError(message(e)); } finally { setBusy(null); }
  }
  const actionButton = (label: string, name: string, disabled = false) => <Button size="sm" variant="light" disabled={locked || dirty || disabled} onClick={() => void action(name)}>{busy === name && <Loader2 size={13} className="animate-spin" />}{label}</Button>;
  const uploadInput = (kind: "recording" | "cover" | "video", label: string) => <label className={cx("inline-flex items-center gap-2 text-sm rounded-xl border border-[#e8eaee] px-3 py-2 cursor-pointer bg-white", (locked || dirty) && "opacity-40 pointer-events-none")}><Upload size={13} />{label}<input type="file" className="sr-only" accept={kind === "cover" ? "image/png,image/jpeg,image/webp" : "video/mp4"} disabled={locked || dirty} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, kind); e.target.value = ""; }} /></label>;
  return <div className="space-y-4">
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold text-lg">{piece.title}</h2><Badge tone={running ? "blue" : p.status === "scheduled" ? "green" : "gray"}>{p.status.replaceAll("_", " ")}</Badge></div>
      <ErrorNote text={error || p.publication?.error || p.error || null} />
      {notice && <p role="status" className="text-sm bg-[#f0f7ff] rounded-xl p-3 mb-4">{notice}</p>}
      {dirty && <p className="text-xs text-[#92400e] mb-3">Unsaved changes. Save before running the next step.</p>}
      <div className="grid md:grid-cols-2 gap-x-4">
        <Field label="Working title"><input className={inputCls} disabled={locked} value={p.title} onChange={e => changed("title", e.target.value)} /></Field>
        <Field label="Video style"><select className={inputCls} disabled={locked} value={p.styleId} onChange={e => changed("styleId", e.target.value)}><option value="">Choose a style</option>{styles.map(s => <option key={s.id} value={s.id} disabled={!s.available}>{s.name}{!s.available ? " (not connected)" : ""}</option>)}</select></Field>
      </div>
      {style && <p className="text-xs text-[#6b7280] mb-4">{style.description} {style.note}</p>}
      <Field label="Topic and direction"><textarea className={inputCls} disabled={locked} rows={3} value={p.topic} onChange={e => changed("topic", e.target.value)} /></Field>
      <Field label="Sources" hint="One source URL per line. Verify claims before approving the script."><textarea className={inputCls} disabled={locked} rows={2} value={p.sourceUrls.join("\n")} onChange={e => changed("sourceUrls", e.target.value.split("\n"))} /></Field>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!dirty || locked} onClick={() => void save()}>{busy === "save" && <Loader2 size={13} className="animate-spin" />}Save changes</Button>{actionButton("Research topic", "research", !p.topic.trim())}{actionButton("Write script", "script", !p.topic.trim())}</div>
    </Card>
    {!!p.research?.length && <Card className="p-5"><h3 className="font-semibold mb-3">Research findings</h3><p className="text-sm text-[#6b7280] mb-3">Choose a finding to use as the topic. Source claims still need review.</p><div className="space-y-3 max-h-96 overflow-auto">{p.research.map((finding, i) => <div key={i} className="border border-[#e8eaee] rounded-2xl p-3">{finding.failure ? <p className="text-xs text-[#92400e]">{finding.failure}</p> : <><p className="text-sm font-medium">{finding.title || "Source finding"}</p><p className="text-sm text-[#6b7280] mt-1 whitespace-pre-wrap">{finding.summary}</p>{finding.url && /^https:\/\//.test(finding.url) && <a className="block text-xs underline my-2 break-all" href={finding.url} target="_blank" rel="noreferrer">{finding.source || finding.url}</a>}<Button size="sm" variant="light" disabled={locked} onClick={() => { changed("topic", [finding.title, finding.summary].filter(Boolean).join("\n\n")); if (finding.url) changed("sourceUrls", [finding.url]); }}>Use this topic</Button></>}</div>)}</div></Card>}
    <Card className="p-5">
      <h3 className="font-semibold mb-4">Script and creative brief</h3>
      <Field label="Creative Brief"><textarea className={inputCls} disabled={locked} rows={5} value={p.brief} onChange={e => changed("brief", e.target.value)} /></Field>
      <Field label="Spoken script"><textarea className={inputCls} disabled={locked} rows={8} value={p.script} onChange={e => changed("script", e.target.value)} /></Field>
      <div className="flex items-center gap-2 flex-wrap">{actionButton("Approve script", "approve-script", !p.script.trim() || !p.brief.trim())}{p.scriptApprovedRevision === p.revision && <Badge tone="green">Current script approved</Badge>}</div>
    </Card>
    <Card className="p-5">
      <h3 className="font-semibold mb-2">Recording and draft</h3>
      <p className="text-sm text-[#6b7280] mb-4">Upload your recording, save your style choice and approve the script. Drafts use your selected LWM style.</p>
      <div className="flex flex-wrap gap-2">{uploadInput("recording", p.assets.recording ? "Replace recording" : "Upload recording")}<Button size="sm" disabled={locked || dirty || !online || !p.assets.recording || !style?.available || (!!p.script.trim() && p.scriptApprovedRevision !== p.revision)} onClick={() => void action("build")}>{busy === "build" ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}Build draft</Button>{uploadInput("video", "Upload edited draft")}</div>
      {!online && <p className="text-xs text-[#92400e] mt-3">Start the production worker on your Mac to build a draft. Uploads and writing remain available.</p>}
      {p.assets.recording && <details className="mt-4"><summary className="text-sm cursor-pointer">Review original recording</summary><video controls preload="metadata" src={asset("recording")} className="mt-3 max-h-80 rounded-xl bg-black" /></details>}
    </Card>
    <Card className="p-5">
      <h3 className="font-semibold mb-2">Cover handoff</h3>
      <p className="text-sm text-[#6b7280] mb-4">Send the topic and script hook to Marcus Carousel Covers. The image step uses Codex image generation, then the finished cover returns here.</p>
      <Field label="Cover direction"><textarea className={inputCls} disabled={locked} rows={4} value={p.coverPrompt} onChange={e => changed("coverPrompt", e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">{actionButton("Prepare cover handoff", "cover", !p.script.trim())}{uploadInput("cover", p.assets.cover ? "Replace cover" : "Upload finished cover")}</div>
    </Card>
    <Card className="p-5">
      <h3 className="font-semibold mb-4">Final review and posting</h3>
      {p.publication && ["uncertain", "failed"].includes(p.publication.state) && <div className="rounded-2xl border border-[#f5d68d] bg-[#fffbeb] p-4 mb-4"><p className="text-sm font-medium">Check Postiz before choosing an outcome</p><p className="text-sm text-[#92400e] mt-1 mb-3">Open Postiz and check every selected account for this exact video and posting time. Marcus OS will not retry automatically. If some accounts are scheduled and others are not, leave this hold in place until every account is reconciled.</p><a href="https://app.postiz.com/" target="_blank" rel="noreferrer" className="text-sm underline inline-block mb-3">Open Postiz</a><div className="flex gap-2 flex-wrap"><Button size="sm" variant="light" disabled={!!busy || running} onClick={() => void action("resolve-publication", "scheduled")}>I checked Postiz: scheduled</Button><Button size="sm" variant="light" disabled={!!busy || running} onClick={() => void action("resolve-publication", "not-posted")}>I checked Postiz: not scheduled</Button></div></div>}
      <p className="text-xs text-[#6b7280] mb-4">The selected cover is used for Instagram. TikTok selects its cover from a video timestamp and does not use this custom cover image.</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>{p.assets.video ? <video key={asset("video")} controls preload="metadata" poster={p.assets.cover ? asset("cover") : undefined} src={asset("video")} className="w-full max-h-[500px] rounded-2xl bg-black" /> : <div className="rounded-2xl bg-[#f4f5f7] p-10 text-center text-sm text-[#6b7280]">Your rendered video appears here.</div>}</div>
        <div>{p.assets.cover ? <img src={asset("cover")} alt="Selected Reel cover" className="w-full max-h-[500px] object-contain rounded-2xl bg-[#f4f5f7]" /> : <div className="rounded-2xl bg-[#f4f5f7] p-10 text-center text-sm text-[#6b7280]">Your selected cover appears here.</div>}</div>
      </div>
      <Field label="Caption"><textarea className={inputCls} disabled={locked} rows={7} value={p.caption} onChange={e => changed("caption", e.target.value)} /></Field>
      <ErrorNote text={channels.error} />
      {!channels.data?.ready && <p className="text-xs text-[#92400e] mb-3">{channels.data?.reason || "Checking Postiz connection."}</p>}
      <fieldset disabled={locked} className="mb-4"><legend className="text-sm font-medium mb-2">Accounts</legend><div className="flex gap-2 flex-wrap">{channels.data?.channels.map(c => <label key={c.id} className="flex items-center gap-2 text-sm border rounded-xl p-3 border-[#e8eaee]"><input type="checkbox" checked={channelIds.includes(c.id)} onChange={e => { setChannelIds(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id)); setReviewed(false); }} />{c.name} <span className="text-xs text-[#6b7280]">{c.identifier}</span></label>)}</div></fieldset>
      <fieldset disabled={locked}><PostOptions value={opts} onChange={(v) => { setOpts(v); setReviewed(false); }} networks={(channels.data?.channels ?? []).filter((c) => channelIds.includes(c.id)).map((c) => c.identifier)} video /></fieldset>
      <Field label="Posting time" hint={`Your browser time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Pick a time at least one minute ahead.`}><input className={inputCls} disabled={locked} type="datetime-local" value={when} onChange={e => { setWhen(e.target.value); setClock(Date.now()); setReviewed(false); }} /></Field>
      <label className="flex gap-2 text-sm mb-4 items-start"><input className="mt-1" type="checkbox" disabled={locked || dirty || !complete || !validSchedule} checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed this exact video, cover, caption, accounts and posting time.</span></label>
      <div className="flex flex-wrap gap-2">{actionButton("Approve this package", "approve", !complete || !validSchedule || !reviewed || !channels.data?.ready)}<ArrowRight size={16} className="self-center text-[#9ca3af]" /><Button size="sm" disabled={locked || dirty || !approvedSelection || !complete || !validSchedule || !channels.data?.ready} onClick={() => void action("schedule")}>Schedule with Postiz</Button></div>
      {approvedSelection && <p className="text-xs text-[#047857] mt-3 flex items-center gap-1"><CheckCircle2 size={13} />This package has saved approval. Scheduling is a separate step.</p>}
    </Card>
    <Card className="p-5"><h3 className="font-semibold mb-3">Production log</h3><div className="flex gap-2 flex-wrap mb-3">{p.tasks?.filter(t => ["queued", "running"].includes(t.status)).map((t, i) => <Badge key={i} tone="blue">{t.stage}: {t.status}</Badge>)}</div>{!p.logs.length && <p className="text-sm text-[#6b7280]">Activity appears here as the workflow runs.</p>}<ol className="space-y-2 max-h-72 overflow-auto">{[...p.logs].reverse().map((log, i) => <li key={`${log.at}-${i}`} className="text-sm border-b border-[#f0f2f5] pb-2"><span className="text-xs text-[#9ca3af] mr-2">{new Date(log.at).toLocaleString()}</span>{log.text}</li>)}</ol></Card>
  </div>;
}

const sourceFields: { key: keyof Sources; label: string; hint: string }[] = [
  { key: "githubSearch", label: "GitHub searches", hint: "Search phrases, one per line" },
  { key: "githubReleases", label: "GitHub releases", hint: "owner/repository, one per line" },
  { key: "redditSubs", label: "Reddit communities", hint: "Subreddit names without r/" },
  { key: "feeds", label: "Official news feeds", hint: "Full HTTPS feed URLs" },
  { key: "youtubeChannels", label: "YouTube channels", hint: "Channel IDs starting with UC" },
  { key: "xUrls", label: "X sources", hint: "Public profile or discussion URLs. Access is checked during research." },
  { key: "scrapeUrls", label: "ScrapeGraph pages", hint: "Supported public AI sites and blogs" },
];
function SourceSettings({ sources, onSaved }: { sources: Sources; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(sourceFields.map(f => [f.key, (sources?.[f.key] || []).join("\n")])) as Record<keyof Sources, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() { setBusy(true); setError(null); try { await api(BASE, { method: "PATCH", json: { sources: Object.fromEntries(sourceFields.map(f => [f.key, draft[f.key].split("\n").map(v => v.trim()).filter(Boolean)])) } }); await onSaved(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  return <Card className="p-4"><details><summary className="font-medium text-sm cursor-pointer">Research sources</summary><p className="text-xs text-[#6b7280] mt-3 mb-3">Sources are shared across Reels. Clear a field to stop using that source type.</p><ErrorNote text={error} />{sourceFields.map(f => <Field key={f.key} label={f.label} hint={f.hint}><textarea className={inputCls} rows={3} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></Field>)}<Button size="sm" disabled={busy} className="w-full" onClick={() => void save()}>Save sources</Button></details></Card>;
}
