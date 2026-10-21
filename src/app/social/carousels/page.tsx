"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button, Card, ErrorNote, Page, PageHeader, RunsOffNote, cx } from "@/components/ui";
import type { Carousel, Mode } from "@/lib/carousel/types";
import { defaultTemplate } from "@/lib/carousel/templates";
import { useCarousel } from "@/components/social/useCarousel";
import { Preview } from "@/components/social/Preview";
import { StyleGallery } from "@/components/social/StyleGallery";
import { TopicStep, MODES } from "@/components/social/TopicStep";
import { HookStep, ReviewStep, PostStep } from "@/components/social/ReviewPost";

type StepId = "topic" | "hook" | "review" | "post";
const STEPS: { id: StepId; label: string }[] = [{ id: "topic", label: "Topic" }, { id: "hook", label: "Hook" }, { id: "review", label: "Review" }, { id: "post", label: "Post" }];

function Studio({ id }: { id: string }) {
  const c = useCarousel(id);
  const settings = useApi<{ settings: { agentRuns: boolean } }>("/api/settings");
  const [step, setStep] = useState<StepId | null>(null);
  const [index, setIndex] = useState(0);
  const { car } = c;
  if (!car) return c.error ? <ErrorNote text={c.error} /> : <p className="text-sm text-[#6b7280]">Loading…</p>;
  const current: StepId = step ?? (car.status !== "draft" ? "post" : car.slides.length ? "review" : car.hooks.length ? "hook" : "topic");
  const idx = Math.min(index, Math.max(0, car.slides.length - 1));
  const setMode = (m: Mode) => c.update({ mode: m, template: m === "creative" && car.mode === "creative" ? car.template : defaultTemplate(m) });
  const common = { car, busy: c.busy, update: c.update, updateSlide: c.updateSlide, generate: c.generate, replace: c.replace, flush: c.flush };

  return (
    <>
      <RunsOffNote on={c.runsOff ? false : settings.data?.settings.agentRuns} />
      <ErrorNote text={c.error} />
      <div className="flex items-center gap-1 mb-4 overflow-x-auto no-scrollbar">
        {STEPS.map((s, n) => (
          <button key={s.id} onClick={() => setStep(s.id)} className={cx("flex items-center gap-2 min-h-9 px-3 rounded-xl text-[13px] font-medium whitespace-nowrap", current === s.id ? "bg-[#1a1d24] text-white" : "text-[#6b7280] hover:bg-white")}>
            <span className={cx("w-5 h-5 rounded-full text-[11px] flex items-center justify-center", current === s.id ? "bg-white text-[#1a1d24]" : "bg-[#e8eaee]")}>{n + 1}</span>{s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#9ca3af] whitespace-nowrap">{c.saving ? "Saving…" : "Saved"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className={cx("min-h-9 px-3.5 rounded-xl text-[13px] font-medium border", car.mode === m.id ? "bg-[#1a1d24] text-white border-transparent" : "bg-white border-[#e8eaee] text-[#1a1d24]")}>{m.label}</button>
        ))}
      </div>
      <div className="flex flex-col-reverse lg:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <Card className="p-4 md:p-5 w-full">
          {current === "topic" && <TopicStep {...common} setError={c.setError} onNext={() => setStep("hook")} />}
          {current === "hook" && <HookStep {...common} onNext={() => { setIndex(0); setStep("review"); }} />}
          {current === "review" && <ReviewStep {...common} index={idx} setIndex={setIndex} onRunsOff={() => c.setRunsOff(true)} onNext={() => setStep("post")} />}
          {current === "post" && <PostStep {...common} />}
        </Card>
        <div className="w-full lg:sticky lg:top-6">
          <Card className="p-4">
            <Preview car={car} index={idx} setIndex={setIndex} onTheme={(t) => c.update({ theme: t })} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Start() {
  const router = useRouter();
  const list = useApi<{ carousels: Carousel[] }>("/api/social/carousels");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = async (mode: Mode, template = defaultTemplate(mode)) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ carousel: Carousel }>("/api/social/carousels", { method: "POST", json: { mode, template } });
      router.push(`/social/carousels?id=${r.carousel.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const drafts = (list.data?.carousels ?? []).filter((c) => c.status === "draft").slice(0, 6);
  return (
    <>
      <ErrorNote text={err} />
      <Card className="p-5 mb-5">
        <p className="font-semibold mb-1">What&apos;s your carousel about?</p>
        <p className="text-sm text-[#6b7280] mb-4">Pick a style to start. You can switch any time.</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => <Button key={m.id} variant="light" disabled={busy} onClick={() => void create(m.id)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {m.label}</Button>)}
        </div>
      </Card>
      <StyleGallery busy={busy} onChoose={(mode, template) => void create(mode, template)} />
      {drafts.length > 0 && (
        <>
          <p className="text-sm font-medium mb-2">Keep working on</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drafts.map((d) => (
              <Card key={d.id} className="p-4" onClick={() => router.push(`/social/carousels?id=${d.id}`)}>
                <p className="font-medium truncate">{d.title || "Untitled carousel"}</p>
                <p className="text-xs text-[#6b7280]">{d.mode} · {d.slides.length} slides · {new Date(d.updatedAt).toLocaleDateString()}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  return (
    <Page wide>
      <PageHeader title="Carousels" sub="Write, design and post Lyfe with Marcus carousels. Nothing posts until you click Post or Schedule."
        action={id ? <Button variant="light" onClick={() => router.push("/social/carousels")}><Plus size={14} /> New</Button> : undefined} />
      {id ? <Studio key={id} id={id} /> : <Start />}
    </Page>
  );
}

export default function CarouselsPage() {
  return <Suspense><Inner /></Suspense>;
}
