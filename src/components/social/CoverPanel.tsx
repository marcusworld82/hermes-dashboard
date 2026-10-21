"use client";
/* eslint-disable @next/next/no-img-element -- private media URLs */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles } from "lucide-react";
import { api, useApi, ApiError } from "@/lib/client";
import { Button, Field, inputCls } from "@/components/ui";
import type { Carousel } from "@/lib/carousel/types";
import { COVER_STYLES, type CoverJob } from "@/lib/carousel/covers";
import { uploadImages, mediaUrl } from "./useCarousel";

type Status = { available: boolean; job: CoverJob | null };
export function CoverPanel({ car, update, flush, onRunsOff }: { car: Carousel; update: (p: Partial<Carousel>) => void; flush: () => Promise<void>; onRunsOff: () => void }) {
  const [styleId, setStyleId] = useState(5);
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poll, setPoll] = useState(false);
  const status = useApi<Status>(car.brandId === "lyfe" ? `/api/social/covers?carouselId=${car.id}` : null, poll ? 2000 : undefined);
  const handled = useRef<string | null>(null);
  const job = status.data?.job;
  const working = busy || job?.status === "running";
  useEffect(() => {
    // Poll persisted jobs after refresh, and apply only the cover field to preserve unsaved inner edits.
    const t = setTimeout(() => {
      setPoll(job?.status === "running");
      if (job?.status === "ready" && job.attached && job.file && handled.current !== job.id) {
        handled.current = job.id;
        update({ cover: { image: job.file, source: "marcus", fit: "contain", styleId: job.styleId } });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [job, update]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try { await flush(); const [image] = await uploadImages(files); if (job) handled.current = job.id; update({ cover: { image, source: "upload", fit: "contain" } }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError(null);
    try {
      await flush();
      const r = await api<{ job: CoverJob }>("/api/social/covers", { method: "POST", json: { carouselId: car.id, styleId, direction } });
      status.setData((s) => ({ available: s?.available ?? true, job: r.job }));
      setPoll(true);
    } catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.runsOff) onRunsOff(); }
    finally { setBusy(false); }
  };
  return <section aria-label="Cover artwork" className="rounded-2xl border border-[#e8eaee] p-3 mb-4">
    <h3 className="font-medium mb-1">Slide 1 cover artwork</h3>
    <p className="text-xs text-[#6b7280] mb-3">Use the template cover, upload a finished design, or create a Marcus-style cover. The remaining slides keep their current template.</p>
    {car.cover && <div className="flex items-start gap-3 mb-3"><img src={mediaUrl(car.cover.image)} alt="Finished cover artwork" className="w-20 aspect-[3/4] object-contain bg-[#f4f5f7] rounded-lg" /><div><p className="text-sm">{car.cover.source === "marcus" ? "Marcus-style cover" : "Uploaded finished cover"}</p><p className="text-xs text-[#6b7280] mt-1">Shown without added text or cropping.</p><Button size="sm" variant="ghost" onClick={() => { if (job) handled.current = job.id; update({ cover: null }); }}>Use template cover instead</Button></div></div>}
    <label className="inline-flex items-center gap-2 min-h-9 px-3 rounded-xl text-[13px] border border-[#e8eaee] cursor-pointer mb-3"><ImagePlus size={14} />Upload finished cover<input aria-label="Upload finished cover" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy || car.status !== "draft"} onChange={(e) => void upload(e.target.files)} /></label>
    <p className="text-xs text-[#6b7280] mb-3">3:4 works best. Other sizes fit without cutting off text.</p>
    {car.brandId === "lyfe" && <details className="border-t border-[#e8eaee] pt-3"><summary className="cursor-pointer text-sm font-medium">Create with my Marcus carousel skill</summary><div className="pt-3">
      <Field label="Saved Marcus cover style"><select aria-label="Saved Marcus cover style" className={inputCls} value={styleId} onChange={(e) => setStyleId(Number(e.target.value))}>{COVER_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
      <Field label="Cover direction (optional)"><textarea className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="For example, working at my desk on a missed-call workflow" maxLength={4000} /></Field>
      <p className="text-xs text-[#6b7280] mb-2">Uses your saved cover skill, current character sheet and first-slide copy through Codex&apos;s built-in image tool. Account limits apply. Review the image before using it.</p>
      {status.data && !status.data.available && <p className="text-xs text-[#b91c1c] mb-2">The saved skill or references are unavailable on your Mac.</p>}
      <Button size="sm" disabled={!!working || !status.data?.available || car.size !== "3:4" || car.status !== "draft" || !car.slides[0]?.headline.trim()} onClick={() => void generate()}>{working ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}Generate Marcus cover</Button>
      {car.size !== "3:4" && <p className="text-xs text-[#92400e] mt-2">Switch the carousel to 3:4 to create a Marcus cover.</p>}
      {job?.status === "running" && <p role="status" className="text-xs text-[#6b7280] mt-2">Creating your cover. You can keep editing the other slides or return later.</p>}
      {job?.status === "error" && <p role="alert" className="text-xs text-[#b91c1c] mt-2">{job.error}</p>}
      {job?.status === "ready" && job.file && !job.attached && <div className="mt-3"><p className="text-xs text-[#6b7280] mb-2">Your cover or hook changed during generation, so this image was kept separately.</p><img src={mediaUrl(job.file)} alt="Generated Marcus cover for review" className="w-32 rounded-lg mb-2" /><Button size="sm" variant="light" onClick={() => { handled.current = job.id; update({ cover: { image: job.file!, source: "marcus", fit: "contain", styleId: job.styleId } }); }}>Use generated cover</Button></div>}
    </div></details>}
    {(error || status.error) && <p role="alert" className="text-xs text-[#b91c1c] mt-2">{error || status.error}</p>}
  </section>;
}
