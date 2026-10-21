"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useState } from "react";
import { ImagePlus, Library, Sparkles, X, Loader2 } from "lucide-react";
import { api, ApiError, useApi } from "@/lib/client";
import { Button, Sheet, inputCls, cx } from "@/components/ui";
import type { Carousel } from "@/lib/carousel/types";
import { uploadImages, mediaUrl } from "./useCarousel";

type Quote = { quote: { quoteId: string; credits: number | null; usd: number | null; description: string | null }; totalUsd: number | null; totalCredits: number | null };

// Slots: most layouts take one photo; Split, Before/After, Started vs Going and the Editorial cover take two.
export function slotNames(car: Carousel, layout: string): string[] {
  if (car.mode === "photo" && ["split", "before-after", "started-going"].includes(layout)) return layout === "split" ? ["Top photo", "Bottom photo"] : layout === "before-after" ? ["Before photo", "After photo"] : ["Started photo", "Going photo"];
  if (car.mode === "editorial" && layout !== "story") return ["Main photo", "Circle inset"];
  return ["Photo"];
}

export function ImagePanel({ car, index, onSet, onRunsOff, onCarousel }: { car: Carousel; index: number; onSet: (slot: number, file: string | null) => void; onRunsOff: () => void; onCarousel: (c: Carousel) => void }) {
  const slide = car.slides[index];
  const slots = slotNames(car, slide.layout);
  const [slot, setSlot] = useState(0);
  const [lib, setLib] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("codex");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hf = useApi<{ ready: boolean; models: { id: string; name: string }[] }>("/api/social/images/quote");
  const media = useApi<{ files: string[] }>(lib ? "/api/social/media" : null);
  const cur = Math.min(slot, slots.length - 1);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload"); setErr(null);
    try { onSet(cur, (await uploadImages(files))[0]); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const getQuote = async () => {
    setBusy("quote"); setErr(null); setQuote(null);
    try { setQuote(await api<Quote>("/api/social/images/quote", { method: "POST", json: { model: provider, prompt, size: car.size } })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const generate = async () => {
    setBusy("gen"); setErr(null);
    try {
      const r = await api<{ carousel: Carousel }>("/api/social/images", { method: "POST", json: { carouselId: car.id, slideIndex: index, slot: cur, provider: provider === "codex" ? "codex" : "higgsfield", prompt, quoteId: quote?.quote.quoteId } });
      onCarousel(r.carousel);
      setQuote(null);
    } catch (e) {
      setErr((e as Error).message);
      if (e instanceof ApiError && e.runsOff) onRunsOff();
      setQuote(null);
    } finally { setBusy(null); }
  };
  const money = (q: Quote) => q.quote.usd !== null ? `$${q.quote.usd.toFixed(3)} per image${q.quote.credits !== null ? ` (${q.quote.credits} credits)` : ""}` : q.quote.description ? `${q.quote.description} (not an exact quote)` : `${q.quote.credits} credits per image`;

  return (
    <div className="rounded-2xl border border-[#e8eaee] p-3 mb-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs font-medium text-[#6b7280]">Images</p>
        {slots.length > 1 && (
          <div className="flex gap-1">
            {slots.map((s, i) => <button key={s} onClick={() => setSlot(i)} className={cx("text-[12px] px-2.5 py-1 rounded-lg", cur === i ? "bg-[#1a1d24] text-white" : "bg-[#f4f5f7] text-[#6b7280]")}>{s}</button>)}
          </div>
        )}
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {slots.map((s, i) => slide.images[i] ? (
          <div key={s} className="relative"> <img src={mediaUrl(slide.images[i])} alt={s} className="w-16 h-20 object-cover rounded-lg border border-[#e8eaee]" />
            <button aria-label={`Remove ${s}`} onClick={() => onSet(i, null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-[#e8eaee] flex items-center justify-center"><X size={12} /></button>
          </div>
        ) : <div key={s} className="w-16 h-20 rounded-lg border border-dashed border-[#d1d5db] text-[10px] text-[#9ca3af] flex items-center justify-center text-center px-1">{s}</div>)}
      </div>
      <div className="flex gap-2 flex-wrap mb-3">
        <label className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[13px] font-medium bg-white border border-[#e8eaee] cursor-pointer hover:bg-[#fafbfc]">
          {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Upload
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e.target.files)} />
        </label>
        <Button size="sm" variant="light" onClick={() => setLib(true)}><Library size={14} /> Library</Button>
      </div>
      <p className="text-xs font-medium text-[#6b7280] mb-1.5 flex items-center gap-1"><Sparkles size={12} /> Generate</p>
      <textarea className={cx(inputCls, "min-h-16 mb-2")} placeholder="A clean desk at sunrise with a laptop and coffee" value={prompt} onChange={(e) => { setPrompt(e.target.value); setQuote(null); }} />
      <select className={cx(inputCls, "mb-2")} value={provider} onChange={(e) => { setProvider(e.target.value); setQuote(null); }}>
        <option value="codex">GPT Image on your ChatGPT plan (included in your plan)</option>
        {(hf.data?.models ?? []).map((m) => <option key={m.id} value={m.id} disabled={!hf.data?.ready}>Higgsfield: {m.name}{hf.data?.ready ? " (paid, price shown first)" : " (add key to use)"}</option>)}
      </select>
      {provider === "codex" ? (
        <>
          <p className="text-xs text-[#6b7280] mb-2">Cost: included in your ChatGPT plan. Plan limits still apply.</p>
          <Button size="sm" disabled={!prompt.trim() || !!busy} onClick={() => void generate()}>{busy === "gen" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate with GPT Image</Button>
        </>
      ) : quote ? (
        <div className="rounded-xl bg-[#fef3c7] text-[#92400e] p-3 text-sm">
          <p className="mb-2">Price from Higgsfield: <b>{money(quote)}</b>. This spends credits.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => void generate()}>{busy === "gen" ? <Loader2 size={14} className="animate-spin" /> : null} Generate for {quote.totalUsd !== null ? `$${quote.totalUsd.toFixed(3)}` : quote.totalCredits !== null ? `${quote.totalCredits} credits` : "the shown price"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setQuote(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="light" disabled={!prompt.trim() || !!busy || !hf.data?.ready} onClick={() => void getQuote()}>{busy === "quote" ? <Loader2 size={14} className="animate-spin" /> : null} Get price</Button>
      )}
      {busy === "gen" && <p className="text-xs text-[#6b7280] mt-2">Making the image. This can take a minute.</p>}
      {err && <p className="text-xs text-[#b91c1c] mt-2">{err}</p>}
      <Sheet open={lib} onClose={() => setLib(false)} title="Media library">
        {!media.data ? <p className="text-sm text-[#6b7280]">Loading…</p> : media.data.files.length === 0 ? <p className="text-sm text-[#6b7280]">No images yet. Upload or generate one.</p> : (
          <div className="grid grid-cols-3 gap-2">
            {media.data.files.map((f) => (
              <button key={f} onClick={() => { onSet(cur, f); setLib(false); }} className="rounded-xl overflow-hidden border border-[#e8eaee] hover:ring-2 hover:ring-[#1a1d24]"> <img src={mediaUrl(f)} alt="" className="w-full aspect-[3/4] object-cover" />
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
