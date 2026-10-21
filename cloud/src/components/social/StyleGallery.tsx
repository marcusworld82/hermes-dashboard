"use client";
/* eslint-disable @next/next/no-img-element -- renderer PNGs must remain unoptimized */

import { useState } from "react";
import { Loader2, Maximize2, RefreshCw } from "lucide-react";
import { Button, Card, Segmented, Sheet } from "@/components/ui";
import type { Mode } from "@/lib/carousel/types";
import { defaultTemplate, templatesFor, templateById } from "@/lib/carousel/templates";
import { MODES } from "./TopicStep";

export function samplePreviewUrl(mode: Mode, index: number, template = defaultTemplate(mode), layout?: string) {
  const q = new URLSearchParams({ mode, index: String(index), template });
  if (layout) q.set("layout", layout);
  return `/api/social/previews?${q}`;
}

export function SampleImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  return (
    <div className="relative w-full aspect-[3/4] bg-[#f4f5f7] rounded-xl overflow-hidden">
      <img src={`${src}${retry ? `&retry=${retry}` : ""}`} alt={alt} onLoad={() => setState("ready")} onError={() => setState("error")} className={state === "ready" ? "absolute inset-0 w-full h-full object-contain" : "hidden"} />
      {state === "loading" && <div role="status" className="absolute inset-0 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#6b7280]" /><span className="sr-only">Rendering slide</span></div>}
      {state === "error" && <div className="absolute inset-0 p-4 flex flex-col items-center justify-center gap-3 text-center text-sm text-[#6b7280]"><p>Preview unavailable. Check your Mac connection.</p><button type="button" onClick={(e) => { e.stopPropagation(); setState("loading"); setRetry((n) => n + 1); }} className="inline-flex items-center gap-2 underline"><RefreshCw size={14} />Retry preview</button></div>}
    </div>
  );
}

const descriptions: Record<Mode, string> = {
  screenshot: "Profile header and clean, readable text.",
  creative: "Browse the existing designed templates.",
  clone: "Example only. Upload a reference to preview your clone.",
  photo: "Your photos with the selected text layout.",
  editorial: "Magazine-style cover and story layouts.",
};

export function StyleGallery({ busy, onChoose }: { busy: boolean; onChoose: (mode: Mode, template: string) => void }) {
  const [index, setIndex] = useState<"cover" | "inner">("cover");
  const [selected, setSelected] = useState<Mode | null>(null);
  const [templates, setTemplates] = useState<Partial<Record<Mode, string>>>({});
  const [layouts, setLayouts] = useState<Partial<Record<Mode, string>>>({});
  const template = (mode: Mode) => templates[mode] || defaultTemplate(mode);
  const image = (mode: Mode) => samplePreviewUrl(mode, index === "cover" ? 0 : 1, template(mode), layouts[mode]);
  return (
    <section aria-label="Carousel style previews" className="mb-6">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div><h2 className="font-semibold">Preview your carousel style</h2><p className="text-sm text-[#6b7280] mt-1">Actual slide renders. Enlarge a style before you choose it.</p></div>
        <Segmented value={index} onChange={setIndex} options={[{ id: "cover", label: "Cover" }, { id: "inner", label: "Inner slide" }]} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {MODES.map((mode) => {
          const choices = templatesFor(mode.id);
          const ls = templateById(template(mode.id)).layouts;
          return <Card key={mode.id} className="p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{mode.label}</h3><button aria-label={`Enlarge ${mode.label} preview`} onClick={() => setSelected(mode.id)} className="p-2 rounded-lg hover:bg-[#f4f5f7]"><Maximize2 size={15} /></button></div>
            <SampleImage key={image(mode.id)} src={image(mode.id)} alt={`${mode.label} ${index} slide preview`} />
            <p className="text-xs text-[#6b7280] min-h-8">{descriptions[mode.id]}</p>
            {choices.length > 1 && <select aria-label={`${mode.label} template`} className="w-full text-sm border border-[#e8eaee] rounded-lg p-2" value={template(mode.id)} onChange={(e) => setTemplates((s) => ({ ...s, [mode.id]: e.target.value }))}>{choices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            {ls.length > 1 && <select aria-label={`${mode.label} layout`} className="w-full text-sm border border-[#e8eaee] rounded-lg p-2" value={layouts[mode.id] || ls[0].id} onChange={(e) => setLayouts((s) => ({ ...s, [mode.id]: e.target.value }))}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
            <Button variant="light" disabled={busy} className="mt-auto" onClick={() => onChoose(mode.id, template(mode.id))}>Use {mode.label}</Button>
          </Card>;
        })}
      </div>
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={`${selected ? MODES.find((m) => m.id === selected)?.label : ""} preview`}>
        {selected && <div className="max-w-sm mx-auto flex flex-col gap-4"><p className="text-sm text-[#6b7280]">{descriptions[selected]}</p><SampleImage key={image(selected)} src={image(selected)} alt={`Enlarged ${selected} ${index} preview`} /><Segmented value={index} onChange={setIndex} options={[{ id: "cover", label: "Cover" }, { id: "inner", label: "Inner slide" }]} /><Button disabled={busy} onClick={() => onChoose(selected, template(selected))}>Use this style</Button></div>}
      </Sheet>
    </section>
  );
}
