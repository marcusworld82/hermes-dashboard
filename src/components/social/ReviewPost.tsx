"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Copy, Trash2, RefreshCw, Plus, Loader2, CheckCircle2, XCircle, Download, Send, CalendarClock } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Field, ErrorNote, inputCls, cx } from "@/components/ui";
import type { Carousel, Slide } from "@/lib/carousel/types";
import { templateById } from "@/lib/carousel/templates";
import { runChecks } from "@/lib/carousel/checks";
import { DEFAULT_BANNED } from "@/lib/carousel/banned";
import { ImagePanel } from "./ImagePanel";
import type { Step } from "./useCarousel";

const Spin = () => <Loader2 size={14} className="animate-spin" />;
const newId = () => `sl_${Math.random().toString(16).slice(2, 12).padEnd(10, "0")}`;

type Common = {
  car: Carousel;
  busy: string | null;
  update: (p: Partial<Carousel> | ((c: Carousel) => Partial<Carousel>)) => void;
  updateSlide: (i: number, p: Partial<Slide>) => void;
  generate: (step: Step, index?: number) => Promise<unknown>;
  replace: (c: Carousel) => void;
  flush: () => Promise<void>;
};

export function HookStep({ car, busy, update, generate, onNext }: Common & { onNext: () => void }) {
  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-3">Pick the cover hook. Each one uses one of your approved formulas.</p>
      <div className="flex flex-col gap-2 mb-3">
        {car.hooks.map((h) => (
          <button key={h.text} onClick={() => update({ hook: h.text })} className={cx("text-left rounded-2xl border px-4 py-3", car.hook === h.text ? "border-[#1a1d24] bg-white" : "border-[#e8eaee] bg-[#fafbfc] hover:bg-white")}>
            <span className="block text-[15px] font-medium">{h.text.replace(/\*/g, "")}</span>
            {h.formula && <span className="text-xs text-[#6b7280]">{h.formula}</span>}
          </button>
        ))}
      </div>
      <Field label="Or write your own hook">
        <input className={inputCls} placeholder="Nobody tells you this about your first $10k" value={car.hooks.some((h) => h.text === car.hook) ? "" : car.hook} onChange={(e) => update({ hook: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button variant="light" disabled={!!busy} onClick={() => void generate("hooks")}>{busy === "hooks" ? <Spin /> : <RefreshCw size={14} />} New hooks</Button>
        <Button disabled={!car.hook.trim() || !!busy} onClick={async () => { const r = await generate("slides"); if (r) onNext(); }}>{busy === "slides" ? <Spin /> : null} Write slides</Button>
      </div>
    </div>
  );
}

// Thumbnails come from the saved carousel, so they also report which slides had to shrink their text.
function useSlideRenders(car: Carousel) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const urls = useRef<string[]>([]);
  const key = JSON.stringify([car.slides, car.template, car.mode, car.size, car.theme, car.useBrandColors, car.clone.spec, car.inputs.badge]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const out: string[] = []; const fl: string[] = [];
      for (let n = 0; n < car.slides.length; n++) {
        try {
          const r = await fetch(`/api/social/carousels/${car.id}/slides/${n}`, { cache: "no-store" });
          if (!r.ok) continue;
          fl.push(...JSON.parse(decodeURIComponent(r.headers.get("x-slide-flags") || "%5B%5D")));
          out[n] = URL.createObjectURL(await r.blob());
        } catch {}
      }
      if (!alive) { out.forEach((u) => u && URL.revokeObjectURL(u)); return; }
      urls.current.forEach((u) => u && URL.revokeObjectURL(u));
      urls.current = out;
      setThumbs(out); setFlags(fl);
    }, 1500);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, car.id]);
  return { thumbs, flags };
}

export function ReviewStep({ car, busy, update, updateSlide, generate, replace, index, setIndex, onRunsOff, onNext }: Common & { index: number; setIndex: (n: number) => void; onRunsOff: () => void; onNext: () => void }) {
  const { thumbs, flags } = useSlideRenders(car);
  const banned = useApi<{ banned: string[] }>("/api/social/banned");
  const checks = useMemo(() => runChecks(car, banned.data?.banned ?? DEFAULT_BANNED, flags), [car, banned.data, flags]);
  const slide = car.slides[index];
  const layouts = templateById(car.template).layouts;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= car.slides.length) return;
    update((c) => { const s = [...c.slides]; const [x] = s.splice(from, 1); s.splice(to, 0, x); return { slides: s }; });
    setIndex(to);
  };
  const remove = (n: number) => { update((c) => ({ slides: c.slides.filter((_, i) => i !== n) })); setIndex(Math.max(0, Math.min(n, car.slides.length - 2))); };
  const dup = (n: number) => { update((c) => { const s = [...c.slides]; s.splice(n + 1, 0, { ...c.slides[n], id: newId() }); return { slides: s }; }); setIndex(n + 1); };
  const add = () => { update((c) => ({ slides: [...c.slides, { ...(c.slides[c.slides.length - 1] ?? { layout: "default", images: [], textScale: 1, dim: 40, showHandle: true }), id: newId(), kind: "body", headline: "New slide", body: "", images: [] } as Slide] })); setIndex(car.slides.length); };

  if (!car.slides.length) return <p className="text-sm text-[#6b7280]">No slides yet. Go back and write them from a hook.</p>;
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
        {car.slides.map((s, n) => (
          <button key={s.id} onClick={() => setIndex(n)} className={cx("shrink-0 w-20 rounded-xl overflow-hidden border", n === index ? "ring-2 ring-[#1a1d24] border-transparent" : "border-[#e8eaee]")}>
            {thumbs[n] ? <img src={thumbs[n]} alt={`Slide ${n + 1}`} className={cx("w-full object-cover", car.size === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]")} />
              : <div className={cx("w-full bg-[#f4f5f7] flex items-center justify-center text-xs text-[#9ca3af]", car.size === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]")}>{n + 1}</div>}
          </button>
        ))}
        {car.slides.length < 10 && <button onClick={add} aria-label="Add slide" className={cx("shrink-0 w-20 rounded-xl border border-dashed border-[#d1d5db] flex items-center justify-center text-[#9ca3af]", car.size === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]")}><Plus size={18} /></button>}
      </div>

      {slide && (
        <div className="rounded-2xl border border-[#e8eaee] p-3 mb-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Slide {index + 1}</span>
              <select className="text-[12px] bg-[#f4f5f7] rounded-lg px-2 py-1" value={slide.kind} onChange={(e) => updateSlide(index, { kind: e.target.value as Slide["kind"] })}>
                <option value="cover">Cover</option><option value="body">Body</option><option value="cta">CTA</option>
              </select>
              {layouts.length > 1 && (
                <select className="text-[12px] bg-[#f4f5f7] rounded-lg px-2 py-1" value={slide.layout === "default" ? layouts[0].id : slide.layout} onChange={(e) => updateSlide(index, { layout: e.target.value })}>
                  {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-1">
              <button aria-label="Move left" onClick={() => move(index, index - 1)} className="w-9 h-9 rounded-xl hover:bg-[#f4f5f7] flex items-center justify-center"><ArrowUp size={15} className="-rotate-90" /></button>
              <button aria-label="Move right" onClick={() => move(index, index + 1)} className="w-9 h-9 rounded-xl hover:bg-[#f4f5f7] flex items-center justify-center"><ArrowDown size={15} className="-rotate-90" /></button>
              <button aria-label="Duplicate slide" onClick={() => dup(index)} className="w-9 h-9 rounded-xl hover:bg-[#f4f5f7] flex items-center justify-center"><Copy size={15} /></button>
              <button aria-label="Delete slide" onClick={() => remove(index)} className="w-9 h-9 rounded-xl hover:bg-[#fee2e2] text-[#b91c1c] flex items-center justify-center"><Trash2 size={15} /></button>
            </div>
          </div>
          <Field label={car.mode === "photo" && slide.layout === "before-after" ? "Left label" : car.mode === "photo" && slide.layout === "split" ? "Top text" : "Headline"} hint="Wrap the key word in *asterisks* to accent it.">
            <input className={inputCls} value={slide.headline} onChange={(e) => updateSlide(index, { headline: e.target.value })} />
          </Field>
          <Field label={car.mode === "photo" && slide.layout === "before-after" ? "Right label" : car.mode === "photo" && slide.layout === "split" ? "Bottom text" : "Body"}>
            <textarea className={cx(inputCls, "min-h-24")} value={slide.body} onChange={(e) => updateSlide(index, { body: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <Field label="Text size"><input type="range" min={0.6} max={1.4} step={0.05} value={slide.textScale} onChange={(e) => updateSlide(index, { textScale: Number(e.target.value) })} className="w-full accent-[#1a1d24]" /></Field>
            <Field label={`Photo dimming ${slide.dim}`}><input type="range" min={0} max={90} step={1} value={slide.dim} onChange={(e) => updateSlide(index, { dim: Number(e.target.value) })} className="w-full accent-[#1a1d24]" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="accent-[#1a1d24]" checked={slide.showHandle} onChange={(e) => updateSlide(index, { showHandle: e.target.checked })} /> Show my handle</label>
          {(car.inputs.includeImages || car.mode === "photo" || car.mode === "editorial" || templateById(car.template).style?.image !== "none") && (
            <ImagePanel car={car} index={index} onRunsOff={onRunsOff} onCarousel={replace}
              onSet={(slot, file) => updateSlide(index, { images: (() => { const im = [...slide.images]; im[slot] = file ?? ""; while (im.length && !im[im.length - 1]) im.pop(); return im; })() })} />
          )}
          <Button size="sm" variant="light" disabled={!!busy} onClick={() => void generate("slide", index)}>{busy === `slide${index}` ? <Spin /> : <RefreshCw size={14} />} Rewrite this slide</Button>
        </div>
      )}

      <Checklist checks={checks} />
      <Button onClick={onNext}>Continue to post</Button>
    </div>
  );
}

function Checklist({ checks }: { checks: ReturnType<typeof runChecks> }) {
  return (
    <div className="rounded-2xl border border-[#e8eaee] p-3 mb-4">
      <p className="text-xs font-medium text-[#6b7280] mb-2">Quality check (from your Social Media rules)</p>
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            {c.ok ? <CheckCircle2 size={16} className="text-[#10b981] mt-0.5 shrink-0" /> : <XCircle size={16} className="text-[#ef4444] mt-0.5 shrink-0" />}
            <span>{c.label}{c.detail && !c.ok && <span className="block text-xs text-[#6b7280]">{c.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Channel = { id: string; name: string; identifier: string; profile: string };
type Record_ = { id: string; carouselId: string; state: string; error: string | null; when: string; postizIds: string[] };

export function PostStep({ car, busy, update, generate, replace, flush }: Common) {
  const ch = useApi<{ ready: boolean; channels: Channel[]; reason: string | null }>("/api/social/postiz/channels");
  const posts = useApi<{ records: Record_[] }>("/api/social/postiz/posts");
  const banned = useApi<{ banned: string[] }>("/api/social/banned");
  const checks = useMemo(() => runChecks(car, banned.data?.banned ?? DEFAULT_BANNED, []), [car, banned.data]);
  const failing = checks.filter((c) => !c.ok);
  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = (posts.data?.records ?? []).filter((r) => r.carouselId === car.id).sort((a, b) => b.when.localeCompare(a.when));
  const pending = mine.find((r) => r.state === "submitting" || r.state === "uncertain");

  const send = async (now: boolean) => {
    setSending(true); setErr(null);
    try {
      await flush();
      const r = await api<{ record: Record_; carousel: Carousel }>(`/api/social/carousels/${car.id}/post`, { method: "POST", json: { channelIds: picked, now, when: now ? "" : new Date(when).toISOString(), caption: car.caption, overrideReason: failing.length ? reason : undefined } });
      replace(r.carousel);
      if (r.record.state !== "scheduled") setErr(r.record.error);
      await posts.reload();
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); }
  };
  const resolve = async (id: string, state: "scheduled" | "failed") => { await api("/api/social/postiz/resolve", { method: "POST", json: { id, state } }); await posts.reload(); };
  const canSend = picked.length > 0 && !!car.caption.trim() && !sending && !pending && (!failing.length || reason.trim().length > 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[#6b7280]">Caption</span>
        <button onClick={() => void generate("caption")} className="text-[12px] text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">{busy === "caption" ? <Spin /> : <RefreshCw size={12} />} {car.caption ? "Rewrite" : "Write caption"}</button>
      </div>
      <textarea className={cx(inputCls, "min-h-48 mb-1")} value={car.caption} onChange={(e) => update({ caption: e.target.value })} placeholder="Write or generate the caption" />
      <p className="text-xs text-[#9ca3af] mb-4">{car.caption.trim() ? car.caption.trim().split(/\s+/).length : 0} words. Aim for 250 to 400, with 3 hashtags.</p>

      <span className="block text-xs font-medium text-[#6b7280] mb-1.5">Post to</span>
      {!ch.data ? <p className="text-sm text-[#6b7280] mb-4">Loading accounts…</p> : !ch.data.ready ? <ErrorNote text={ch.data.reason} /> : (
        <div className="flex flex-col gap-1.5 mb-4">
          {ch.data.channels.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-xl border border-[#e8eaee] px-3 py-2 cursor-pointer">
              <input type="checkbox" className="accent-[#1a1d24]" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
              <span className="text-sm">{c.name}</span><Badge>{c.identifier}</Badge>
            </label>
          ))}
          {ch.error && <ErrorNote text={ch.error} />}
        </div>
      )}

      <Field label="Schedule for (your local time)">
        <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>

      {failing.length > 0 && (
        <Field label={`${failing.length} quality check${failing.length > 1 ? "s" : ""} failing. Why post anyway?`} hint="Saved with the post. Or go back to Review and fix them.">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Testing a new format" />
        </Field>
      )}

      {pending ? (
        <div className="rounded-2xl bg-[#fef3c7] text-[#92400e] p-3 text-sm mb-3">
          <p className="mb-2">{pending.state === "uncertain" ? "Postiz didn't confirm the last post. Check Postiz before trying again, so it doesn't post twice." : "A post is being sent."} {pending.error}</p>
          {pending.state === "uncertain" && (
            <div className="flex gap-2"><Button size="sm" onClick={() => void resolve(pending.id, "scheduled")}>It posted</Button><Button size="sm" variant="light" onClick={() => void resolve(pending.id, "failed")}>It didn&apos;t post</Button></div>
          )}
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap mb-3">
          <Button disabled={!canSend || !when} onClick={() => void send(false)}>{sending ? <Spin /> : <CalendarClock size={14} />} Schedule</Button>
          <Button variant="light" disabled={!canSend} onClick={() => void send(true)}><Send size={14} /> Post now</Button>
          <a href={`/api/social/carousels/${car.id}/zip`} className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-2xl text-sm font-medium bg-white border border-[#e8eaee]"><Download size={14} /> Download PNGs</a>
        </div>
      )}
      <ErrorNote text={err} />
      {mine.filter((r) => r !== pending).map((r) => (
        <p key={r.id} className="text-sm text-[#6b7280]"><Badge tone={r.state === "scheduled" ? "green" : r.state === "failed" ? "red" : "gray"}>{r.state}</Badge> {new Date(r.when).toLocaleString()} {r.error ?? ""}</p>
      ))}
    </div>
  );
}
