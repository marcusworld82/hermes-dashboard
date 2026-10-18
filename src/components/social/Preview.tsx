"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Segmented, cx } from "@/components/ui";
import type { Carousel, Theme } from "@/lib/carousel/types";

// The same renderer that makes the posted PNGs draws this preview, so what you see is what posts.
export function Preview({ car, index, setIndex, onTheme }: { car: Carousel; index: number; setIndex: (n: number) => void; onTheme: (t: Theme) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prev = useRef<string | null>(null);
  const key = JSON.stringify({ s: car.slides[index], m: car.mode, t: car.template, z: car.size, th: car.theme, b: car.useBrandColors, i: car.inputs.badge, inc: car.inputs.includeImages, c: car.clone.spec, n: car.slides.length, title: car.title });

  useEffect(() => {
    if (!car.slides[index]) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch("/api/social/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ carousel: car, index }), signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Preview failed.");
          setFlags(JSON.parse(decodeURIComponent(r.headers.get("x-slide-flags") || "%5B%5D")));
          return r.blob();
        })
        .then((b) => {
          const u = URL.createObjectURL(b);
          if (prev.current) URL.revokeObjectURL(prev.current);
          prev.current = u;
          setUrl(u);
          setErr(null);
        })
        .catch((e: Error) => { if (e.name !== "AbortError") setErr(e.message); })
        .finally(() => setLoading(false));
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
    // The key captures every field that changes the drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index]);

  const total = car.slides.length;
  const aspect = car.size === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#6b7280]">Preview</p>
        {car.mode === "screenshot" && (
          <Segmented<Theme> value={car.theme} onChange={onTheme} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "brand", label: "Brand" }]} />
        )}
      </div>
      <div className={cx("relative w-full rounded-2xl overflow-hidden bg-[#f4f5f7] border border-[#e8eaee]", aspect)}>
        {total === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#9ca3af] px-6 text-center">Your slides show here once they&apos;re written.</div>
        ) : url ? (
          <img src={url} alt={`Slide ${index + 1}`} className="absolute inset-0 w-full h-full object-contain" />
        ) : null}
        {loading && <Loader2 size={18} className="absolute top-3 right-3 animate-spin text-[#9ca3af]" />}
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between">
          <button aria-label="Previous slide" disabled={index === 0} onClick={() => setIndex(index - 1)} className="w-10 h-10 rounded-xl hover:bg-white disabled:opacity-30 flex items-center justify-center"><ChevronLeft size={18} /></button>
          <span className="text-sm text-[#6b7280]">Slide {index + 1} of {total}</span>
          <button aria-label="Next slide" disabled={index >= total - 1} onClick={() => setIndex(index + 1)} className="w-10 h-10 rounded-xl hover:bg-white disabled:opacity-30 flex items-center justify-center"><ChevronRight size={18} /></button>
        </div>
      )}
      {err && <p className="text-xs text-[#b91c1c]">{err}</p>}
      {flags.map((f) => <p key={f} className="text-xs text-[#92400e] bg-[#fef3c7] rounded-xl px-3 py-2">{f}</p>)}
    </div>
  );
}
