"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, RefreshCw } from "lucide-react";
import { Segmented, Sheet, cx } from "@/components/ui";
import type { Carousel, Theme } from "@/lib/carousel/types";
import { previewRequestKey } from "@/lib/carousel/previews";
import { SampleImage } from "./StyleGallery";

type Result = { key: string; url: string; flags: string[] };

// Live unsaved edits use the same renderer as exports. A request owns its own blob URL.
export function Preview({ car, index, setIndex, onTheme }: { car: Carousel; index: number; setIndex: (n: number) => void; onTheme: (t: Theme) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const payload = previewRequestKey(car, index);
  const key = `${payload}:${retry}`;
  const total = car.slides.length;

  useEffect(() => {
    if (!total) return;
    const ctrl = new AbortController();
    let url: string | null = null;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/social/render", { method: "POST", headers: { "content-type": "application/json" }, body: payload, signal: ctrl.signal });
        if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || "Preview failed.");
        const blob = await response.blob();
        if (ctrl.signal.aborted) return;
        url = URL.createObjectURL(blob);
        const flags = JSON.parse(decodeURIComponent(response.headers.get("x-slide-flags") || "%5B%5D"));
        setResult({ key, url, flags });
      } catch (e) {
        if (!ctrl.signal.aborted) setError({ key, message: (e as Error).message });
      }
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); if (url) URL.revokeObjectURL(url); };
  }, [payload, key, total]);

  const current = result?.key === key ? result : null;
  const err = error?.key === key ? error.message : null;
  const loading = total > 0 && !current && !err;
  const aspect = car.size === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]";
  const sample = new URLSearchParams({ mode: car.mode, template: car.template, size: car.size, theme: car.theme, brandId: car.brandId, index: "0" });
  const image = (large = false) => !total ? (
    <SampleImage key={sample.toString()} src={`/api/social/previews?${sample}`} alt={`${car.mode} style example`} />
  ) : (
    <div className={cx("relative w-full rounded-2xl overflow-hidden bg-[#f4f5f7] border border-[#e8eaee]", aspect)}>
      {current && <img src={current.url} alt={`${large ? "Enlarged " : ""}Slide ${index + 1}`} className="absolute inset-0 w-full h-full object-contain" />}
      {loading && <div role="status" className="absolute inset-0 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#6b7280]" /><span className="sr-only">Rendering slide</span></div>}
      {err && <div className="absolute inset-0 p-5 flex flex-col gap-3 items-center justify-center text-center"><p role="alert" className="text-sm text-[#b91c1c]">{err}</p><button onClick={() => setRetry((n) => n + 1)} className="inline-flex gap-2 items-center text-sm underline"><RefreshCw size={15} />Retry preview</button></div>}
    </div>
  );
  const navigation = total > 0 && <div className="flex items-center justify-between"><button aria-label="Previous slide" disabled={index === 0} onClick={() => setIndex(index - 1)} className="w-10 h-10 rounded-xl hover:bg-white disabled:opacity-30 flex items-center justify-center"><ChevronLeft size={18} /></button><span className="text-sm text-[#6b7280]">Slide {index + 1} of {total}</span><button aria-label="Next slide" disabled={index >= total - 1} onClick={() => setIndex(index + 1)} className="w-10 h-10 rounded-xl hover:bg-white disabled:opacity-30 flex items-center justify-center"><ChevronRight size={18} /></button></div>;
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-[#6b7280]">{total ? "Live slide preview" : "Style example"}</p><button aria-label="Enlarge slide preview" onClick={() => setExpanded(true)} className="p-2 rounded-lg hover:bg-[#f4f5f7]"><Maximize2 size={15} /></button></div>
    {car.mode === "screenshot" && <Segmented<Theme> value={car.theme} onChange={onTheme} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "brand", label: "Brand" }]} />}
    {image()}
    {!total && <p className="text-xs text-[#6b7280]">Example copy. Your own slides will appear here when written.{car.mode === "clone" ? " Upload a reference to preview its analyzed style." : ""}</p>}
    {navigation}
    {current?.flags.map((f) => <p key={f} className="text-xs text-[#92400e] bg-[#fef3c7] rounded-xl px-3 py-2">{f}</p>)}
    <Sheet open={expanded} onClose={() => setExpanded(false)} title={total ? `Slide ${index + 1} of ${total}` : "Style example"}><div className="max-w-sm mx-auto">{image(true)}{navigation}</div></Sheet>
  </div>;
}
