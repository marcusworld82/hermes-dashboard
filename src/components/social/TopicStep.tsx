"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useState } from "react";
import { RefreshCw, Newspaper, Link2, Upload, Loader2, ChevronDown, Ban, Wand2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button, Field, Segmented, Sheet, inputCls, cx } from "@/components/ui";
import { STRUCTURES, type Carousel, type Goal, type Badge, type Size, type Mode } from "@/lib/carousel/types";
import { templatesFor, templateById } from "@/lib/carousel/templates";
import { uploadImages, mediaUrl, type Step } from "./useCarousel";

type Props = {
  car: Carousel;
  busy: string | null;
  update: (p: Partial<Carousel> | ((c: Carousel) => Partial<Carousel>)) => void;
  generate: (step: Step, index?: number) => Promise<unknown>;
  replace: (c: Carousel) => void;
  flush: () => Promise<void>;
  setError: (s: string | null) => void;
  onNext: () => void;
};

const Spin = () => <Loader2 size={14} className="animate-spin" />;

export function TopicStep({ car, busy, update, generate, replace, flush, setError, onNext }: Props) {
  const [refUrl, setRefUrl] = useState(car.inputs.referenceUrl.startsWith("http") ? car.inputs.referenceUrl : "");
  const [refBusy, setRefBusy] = useState(false);
  const [bannedOpen, setBannedOpen] = useState(false);
  const i = car.inputs;
  const set = (p: Partial<Carousel["inputs"]>) => update({ inputs: { ...i, ...p } });

  const readRef = async (file?: File) => {
    setRefBusy(true); setError(null);
    try {
      await flush();
      const form = new FormData();
      form.set("carouselId", car.id);
      if (file) form.set("file", file); else form.set("url", refUrl);
      const res = await fetch("/api/social/reference", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't read that.");
      replace(data.carousel);
    } catch (e) { setError((e as Error).message); } finally { setRefBusy(false); }
  };

  const uploadClone = async (files: FileList | null, which: "cover" | "inner") => {
    if (!files?.length) return;
    try {
      const got = await uploadImages(which === "cover" ? [files[0]] : Array.from(files).slice(0, 3));
      update((c) => ({ clone: which === "cover" ? { ...c.clone, cover: got[0], spec: null } : { ...c.clone, inner: [...c.clone.inner, ...got].slice(0, 3), spec: null } }));
    } catch (e) { setError((e as Error).message); }
  };

  const layouts = templateById(car.template).layouts;
  const setLayoutAll = (layout: string) => update((c) => ({ slides: c.slides.map((s) => ({ ...s, layout })), template: c.template }));

  return (
    <div>
      <Field label="Carousel title">
        <input className={inputCls} placeholder="5 money habits nobody taught you" value={car.title} onChange={(e) => update({ title: e.target.value, inputs: { ...i, topic: e.target.value } })} />
      </Field>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[#6b7280]">Topic ideas</span>
          <button onClick={() => void generate("ideas")} className="text-[12px] text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">{busy === "ideas" ? <Spin /> : <RefreshCw size={12} />} {car.ideas.length ? "Refresh" : "Suggest"}</button>
        </div>
        <input className={cx(inputCls, "mb-2")} placeholder="Steer the ideas: more psychology, less generic productivity" value={i.steer} onChange={(e) => set({ steer: e.target.value })} />
        {car.ideas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {car.ideas.map((idea) => (
              <button key={idea} onClick={() => update({ title: idea, inputs: { ...i, topic: idea } })} className={cx("text-left text-sm rounded-xl border px-3 py-2", car.title === idea ? "border-[#1a1d24] bg-white" : "border-[#e8eaee] bg-[#fafbfc] hover:bg-white")}>{idea}</button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-[#e8eaee] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[#6b7280] flex items-center gap-1"><Newspaper size={12} /> In the news</span>
          <button onClick={() => void generate("news")} className="text-[12px] text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">{busy === "news" ? <Spin /> : <RefreshCw size={12} />} Find stories</button>
        </div>
        {car.news.map((n) => (
          <div key={n.url} className="mt-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a href={n.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">{n.title}</a>
              <p className="text-xs text-[#6b7280]">{n.summary}</p>
            </div>
            <Button size="sm" variant="light" onClick={() => update({ title: n.title, inputs: { ...i, topic: n.title, context: `${i.context}\nNews: ${n.title}. ${n.summary} (${n.url})`.trim() } })}>Use</Button>
          </div>
        ))}
      </div>

      <Field label="Additional context (optional)">
        <textarea className={cx(inputCls, "min-h-20")} placeholder="Keep tone light, focus on actionable tips, target audience is new creators" value={i.context} onChange={(e) => set({ context: e.target.value })} />
      </Field>

      <div className="mb-4 rounded-2xl border border-[#e8eaee] p-3">
        <span className="block text-xs font-medium text-[#6b7280] mb-1.5">Reference (optional)</span>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="https://example.com/article" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
          <Button size="sm" variant="light" disabled={!refUrl || refBusy} onClick={() => void readRef()}>{refBusy ? <Spin /> : <Link2 size={14} />} Read</Button>
          <label className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[13px] font-medium bg-white border border-[#e8eaee] cursor-pointer whitespace-nowrap">
            <Upload size={14} /> File
            <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && void readRef(e.target.files[0])} />
          </label>
        </div>
        {i.referenceText && <p className="text-xs text-[#047857] mt-2">Read {i.referenceUrl || "reference"} ({i.referenceText.length.toLocaleString()} characters). Claude will use it.</p>}
      </div>

      <label className="flex items-center justify-between rounded-2xl border border-[#e8eaee] px-3 py-2.5 mb-4 cursor-pointer">
        <span className="text-sm">Include images<span className="block text-xs text-[#6b7280]">Add or generate photos per slide in Review</span></span>
        <input type="checkbox" className="w-5 h-5 accent-[#1a1d24]" checked={i.includeImages} onChange={(e) => set({ includeImages: e.target.checked })} />
      </label>

      {car.mode === "creative" && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[#6b7280]">Template</span>
            <label className="text-[12px] text-[#6b7280] flex items-center gap-1.5"><input type="checkbox" className="accent-[#1a1d24]" checked={car.useBrandColors} onChange={(e) => update({ useBrandColors: e.target.checked })} /> Use Lyfe brand colors</label>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {templatesFor("creative").map((t) => (
              <button key={t.id} onClick={() => update({ template: t.id })} className={cx("rounded-xl overflow-hidden border text-left", car.template === t.id ? "ring-2 ring-[#1a1d24] border-transparent" : "border-[#e8eaee]")}>
                <div className="aspect-[3/4] p-2 flex flex-col justify-between" style={{ background: t.style!.bg, color: t.style!.text }}>
                  <span className={cx("text-[15px] leading-tight", t.style!.textCase === "upper" && "uppercase font-black")}>How to <span style={{ color: t.style!.accent }}>start</span></span>
                  <span className="text-[9px] opacity-70">{t.style!.image === "none" ? "Type only" : t.style!.image === "below" ? "Text + image" : "Full photo"}</span>
                </div>
                <div className="text-[11px] px-2 py-1 bg-white text-[#1a1d24]">{t.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {car.mode === "clone" && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#e8eaee] p-3">
            <p className="text-xs font-medium text-[#6b7280] mb-2">Cover slide inspiration (required)</p>
            {car.clone.cover && <img src={mediaUrl(car.clone.cover)} alt="Cover to clone" className="w-24 rounded-lg mb-2" />}
            <label className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[13px] font-medium bg-white border border-[#e8eaee] cursor-pointer"><Upload size={14} /> Upload cover<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadClone(e.target.files, "cover")} /></label>
          </div>
          <div className="rounded-2xl border border-[#e8eaee] p-3">
            <p className="text-xs font-medium text-[#6b7280] mb-2">Inner slide inspiration (optional, up to 3)</p>
            <div className="flex gap-1 mb-2">{car.clone.inner.map((f) => <img key={f} src={mediaUrl(f)} alt="" className="w-14 rounded" />)}</div>
            <label className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[13px] font-medium bg-white border border-[#e8eaee] cursor-pointer"><Upload size={14} /> Upload slides<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadClone(e.target.files, "inner")} /></label>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button size="sm" variant="light" disabled={!car.clone.cover || !!busy} onClick={() => void generate("clone")}>{busy === "clone" ? <Spin /> : <Wand2 size={14} />} Read the style</Button>
            {car.clone.spec && <span className="text-xs text-[#6b7280] flex items-center gap-1.5">{[car.clone.spec.bg, car.clone.spec.text, car.clone.spec.accent].map((c) => <span key={c} className="w-4 h-4 rounded border border-[#e8eaee]" style={{ background: c }} />)} {car.clone.spec.notes}</span>}
          </div>
        </div>
      )}

      {(car.mode === "photo" || car.mode === "editorial") && (
        <div className="mb-4">
          <span className="block text-xs font-medium text-[#6b7280] mb-1.5">Layout (you can change each slide in Review)</span>
          <Segmented value={car.slides[0]?.layout && car.slides[0].layout !== "default" ? car.slides[0].layout : layouts[0].id} onChange={setLayoutAll} options={layouts.map((l) => ({ id: l.id, label: l.name }))} />
        </div>
      )}

      <details className="mb-4 rounded-2xl border border-[#e8eaee] group">
        <summary className="list-none cursor-pointer px-3 py-2.5 text-sm flex items-center justify-between">Advanced settings <ChevronDown size={16} className="group-open:rotate-180 transition" /></summary>
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Field label="Output">
            <Segmented value={i.output} onChange={(v) => set({ output: v })} options={[{ id: "carousel", label: "Carousel" }, { id: "single", label: "Single post" }]} />
          </Field>
          <Field label="Size">
            <Segmented<Size> value={car.size} onChange={(v) => update({ size: v })} options={[{ id: "3:4", label: "3:4 (default)" }, { id: "4:5", label: "4:5 (ad-safe)" }]} />
          </Field>
          <Field label={`Slides: ${i.slideCount}`}>
            <input type="range" min={3} max={10} step={1} value={i.slideCount} onChange={(e) => set({ slideCount: Number(e.target.value) })} className="w-full accent-[#1a1d24]" />
          </Field>
          <Field label="Text size">
            <input type="range" min={0.7} max={1.3} step={0.05} value={car.slides[0]?.textScale ?? 1} onChange={(e) => update((c) => ({ slides: c.slides.map((s) => ({ ...s, textScale: Number(e.target.value) })) }))} className="w-full accent-[#1a1d24]" />
          </Field>
          <Field label="Verified badge">
            <Segmented<Badge> value={i.badge} onChange={(v) => set({ badge: v })} options={[{ id: "none", label: "None" }, { id: "blue", label: "Blue" }, { id: "gold", label: "Gold" }]} />
          </Field>
          <Field label="Goal">
            <select className={inputCls} value={i.goal} onChange={(e) => set({ goal: e.target.value as Goal })}>
              <option value="reach">Reach (shares)</option><option value="trust">Trust (follows)</option><option value="saves">Saves</option><option value="sales">Sales (DM keyword)</option><option value="dms">DMs (comment keyword)</option>
            </select>
          </Field>
          <Field label="Structure">
            <select className={inputCls} value={i.structure} onChange={(e) => set({ structure: e.target.value as Carousel["inputs"]["structure"] })}>
              {STRUCTURES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Banned words">
            <Button size="sm" variant="light" onClick={() => setBannedOpen(true)}><Ban size={14} /> Edit list</Button>
          </Field>
        </div>
      </details>

      <Button disabled={!car.title.trim() || !!busy} onClick={async () => { const r = await generate("hooks"); if (r) onNext(); }}>{busy === "hooks" ? <Spin /> : null} Write hooks</Button>
      <BannedSheet open={bannedOpen} onClose={() => setBannedOpen(false)} />
    </div>
  );
}

function BannedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useApi<{ banned: string[] }>(open ? "/api/social/banned" : null);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (data?.banned ?? []).join("\n");
  return (
    <Sheet open={open} onClose={onClose} title="Banned words and phrases" footer={<Button onClick={async () => { await api("/api/social/banned", { method: "POST", json: { banned: value.split("\n") } }); setText(null); await reload(); onClose(); }}>Save</Button>}>
      <p className="text-sm text-[#6b7280] mb-2">One per line. Claude rewrites anything that uses these, and Review flags any that slip through.</p>
      <textarea className={cx(inputCls, "min-h-80 font-mono text-[13px]")} value={value} onChange={(e) => setText(e.target.value)} />
    </Sheet>
  );
}

export const MODES: { id: Mode; label: string }[] = [
  { id: "screenshot", label: "Screenshot" },
  { id: "creative", label: "Creative" },
  { id: "clone", label: "Clone" },
  { id: "photo", label: "Photo" },
  { id: "editorial", label: "Editorial" },
];
