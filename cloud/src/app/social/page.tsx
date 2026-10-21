"use client";

import {PostComposer} from '@/components/social/PostComposer';
import { Suspense, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { useRouter } from "next/navigation";
import { Badge, Card, Empty, ErrorNote, Page, PageHeader, Segmented, Sheet, cx } from "@/components/ui";

type Delivery = { network: string; account: string; scheduledUtc: string; timezone: string; status: string; url: string | null; error: string | null };
type Plan = { id: string; title: string; format: string; brand: string; date: string; captions: Record<string, string>; sourceUrl: string; reviewStatus: string; body: string; issues: string[] };
type Post = { id: number | string; title: string; format: string; brand: string; captions: Record<string, string>; updatedAt: string; deliveries: Delivery[]; plan?: Plan };
type HermesRecord = { id: string; carouselId: string; channelIds: string[]; when: string; now: boolean; caption: string; state: string; error: string | null };
type Data = { ready: boolean; reason: string | null; posts: Post[]; legacy: { id: number; caption: string; scheduledUtc: string; status: string; simulated: boolean }[]; crmUrl: string; planning?: { batchId: string | null; items: Plan[]; error: string | null } };

const tone = (s: string) => (s === "published" ? "green" : s === "scheduled" ? "blue" : s === "failed" ? "red" : s === "canceled" ? "gray" : "amber") as "green" | "blue" | "red" | "gray" | "amber";
const toDate = (utc: string) => new Date(utc.endsWith("Z") || utc.includes("+") ? utc : `${utc.replace(" ", "T")}Z`);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const plannedDay = (date: string) => { const [year, month, day] = date.split("-").map(Number); return new Date(year, month - 1, day); };

function SocialInner() {
  const { data, error } = useApi<Data>("/api/social", 60_000);
  // Carousels Marcus OS posted or scheduled through Postiz.
  const hermes = useApi<{ records: HermesRecord[] }>("/api/social/postiz/posts", 60_000);
  const hermesCars = useApi<{ carousels: { id: string; title: string; planId?: string; status?: string }[] }>("/api/social/carousels");
  const router = useRouter();
  const [making, setMaking] = useState<string | null>(null);
  const [makeErr, setMakeErr] = useState<string | null>(null);
  // Turns a planned entry into a carousel draft (or opens the one already started) on the Carousels page.
  const makeCarousel = async (planId: string) => {
    setMaking(planId); setMakeErr(null);
    try { const r = await api<{ carousel: { id: string } }>("/api/social/carousels", { method: "POST", json: { planId } }); router.push(`/social/carousels?id=${r.carousel.id}`); }
    catch (e) { setMakeErr((e as Error).message); setMaking(null); }
  };
  const [view, setView] = useState<"calendar" | "posts">("calendar");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openId, setOpenId] = useState<number | string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const plans = data?.planning?.items ?? [];
  const hermesPosts: Post[] = (hermes.data?.records ?? []).filter((r) => r.state !== "canceled").map((r) => ({
    id: r.id, title: hermesCars.data?.carousels.find((c) => c.id === r.carouselId)?.title || (r.carouselId.startsWith("compose_") ? "Social post" : "Marcus OS carousel"), format: "post", brand: "Lyfe with Marcus", captions: { instagram: r.caption }, updatedAt: r.when,
    deliveries: [{ network: "Marcus OS", account: `${r.channelIds.length} account${r.channelIds.length === 1 ? "" : "s"}`, scheduledUtc: r.when, timezone: "", status: r.state === "scheduled" ? "scheduled" : r.state, url: null, error: r.error }],
  }));
  const posts: Post[] = [...plans.map((plan) => ({ id: plan.id, title: plan.title, format: plan.format, brand: plan.brand, captions: plan.captions, updatedAt: "", deliveries: [], plan })), ...hermesPosts, ...(data?.posts ?? [])];
  const open = posts.find((post) => post.id === openId) ?? null;
  const events = posts.flatMap((p) => p.plan
    ? [{ post: p, d: { network: "Planned", account: "Notion", scheduledUtc: "", timezone: "", status: "planned", url: null, error: null } as Delivery, at: plannedDay(p.plan.date), planned: true }]
    : p.deliveries.map((d) => ({ post: p, d, at: toDate(d.scheduledUtc), planned: false })));
  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(dayKey(e.at), [...(byDay.get(dayKey(e.at)) ?? []), e]);
  const upcoming = events.filter((e) => e.at.getTime() >= nowMs - 86400000).sort((a, b) => a.at.getTime() - b.at.getTime());

  const first = new Date(month);
  const startPad = first.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];

  return (
    <Page wide>
      <PageHeader
        title="Social"
        sub="Plan your content here. Planned entries are drafts and do not queue anything to publish. Live publishing records remain separate."
        action={
          <PostComposer />
        }
      />
      <ErrorNote text={error || (data && !data.ready ? data.reason : null)} />
      <ErrorNote text={data?.planning?.error ?? null} />
      {plans.length > 0 && <p className="text-sm text-[#6b7280] mb-4">{plans.length} planned pieces from Notion. Dates are planning days, not posting times. Open a card for captions, review notes and its source.</p>}
      <Segmented
        className="mb-4 w-fit"
        value={view}
        onChange={setView}
        options={[
          { id: "calendar", label: "Calendar", count: events.length },
          { id: "posts", label: "Drafts and captions", count: posts.length },
        ]}
      />

      {view === "calendar" ? (
        <>
          <Card className="p-4 hidden md:block">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
              <div className="flex gap-1">
                <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-10 h-10 rounded-xl hover:bg-[#f4f5f7] flex items-center justify-center">
                  <ChevronLeft size={18} />
                </button>
                <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-10 h-10 rounded-xl hover:bg-[#f4f5f7] flex items-center justify-center">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[11px] text-[#9ca3af] mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <p key={d} className="px-2">
                  {d}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                const list = d ? byDay.get(dayKey(d)) ?? [] : [];
                const today = d && dayKey(d) === dayKey(new Date(nowMs));
                return (
                  <div key={i} className={cx("min-h-24 rounded-2xl p-1.5 border", d ? "border-[#f0f1f3] bg-[#fafbfc]" : "border-transparent", today && "border-[#1a1d24]/30 bg-white")}>
                    {d && <p className={cx("text-xs px-1", today ? "font-semibold" : "text-[#9ca3af]")}>{d.getDate()}</p>}
                    {list.map((e, j) => (
                      <button key={j} onClick={() => setOpenId(e.post.id)} className="block w-full text-left text-[11px] truncate rounded-lg bg-white border border-[#e8eaee] px-1.5 py-1 mt-1">
                        {e.d.network} · {e.post.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="md:hidden space-y-2">
            {upcoming.length === 0 && (
              <Card>
                <Empty title="No upcoming content" sub="Imported plans and publishing records appear here." />
              </Card>
            )}
            {upcoming.map((e, i) => (
              <Card key={i} className="p-3.5" onClick={() => setOpenId(e.post.id)}>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#6b7280]">{e.planned ? e.at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : e.at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  <Badge tone={tone(e.d.status)} className="ml-auto">
                    {e.d.status}
                  </Badge>
                </div>
                <p className="text-sm font-medium mt-1">{e.post.title}</p>
                <p className="text-xs text-[#9ca3af]">
                  {e.d.network} · {e.d.account}
                </p>
              </Card>
            ))}
          </div>
          {events.length === 0 && (
            <p className="hidden md:block text-sm text-[#9ca3af] mt-3">No content on this calendar yet. Import a plan or schedule approved finished media in the CRM.</p>
          )}
        </>
      ) : posts.length === 0 ? (
        <Card>
          <Empty title="No drafts yet" sub="Drafts and captions you write in the CRM's Social workspace show up here." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4" onClick={() => setOpenId(p.id)}>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="purple">{p.format}</Badge>
                <Badge>{p.brand}</Badge>
                <span className="text-[11px] text-[#9ca3af] ml-auto">{p.plan ? `Planned ${p.plan.date}` : `${p.deliveries.length} publishing records`}</span>
              </div>
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-[#6b7280] mt-1 line-clamp-3">{Object.values(p.captions)[0] ?? "No caption yet"}</p>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.title ?? ""}>
        {open && (
          <div>
            <div className="flex gap-2 mb-4">
              <Badge tone="purple">{open.format}</Badge>
              <Badge>{open.brand}</Badge>
            </div>
            {open.plan && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 mb-4">
              <p className="text-sm font-medium">Planned for {open.plan.date}. {open.plan.reviewStatus}.</p>
              <p className="text-sm mt-1">{hermesCars.data?.carousels.some((c) => c.planId === open.plan!.id) ? "A carousel draft exists for this entry." : "Not created yet. Nothing is scheduled."}</p>
              <a className="inline-block underline text-sm mt-2" href={open.plan.sourceUrl} target="_blank" rel="noreferrer">Open full content in Notion</a>
              {(() => {
                const made = hermesCars.data?.carousels.find((c) => c.planId === open.plan!.id);
                const visual = /^(carousel|post|static|single)$/i.test(open.plan.format) || /^(carousel|static)/i.test(open.title);
                return <div className="flex flex-wrap gap-2 mt-3">
                  {visual
                    ? <button disabled={making === open.plan.id} onClick={() => void makeCarousel(open.plan!.id)} className="px-4 py-2 rounded-xl bg-[#1a1d24] text-white text-sm font-medium disabled:opacity-50">{making === open.plan.id ? "Opening…" : made ? `Open ${made.status === "scheduled" ? "scheduled" : "draft"} carousel` : "Create this carousel"}</button>
                    : <a href="/social/content" className="px-4 py-2 rounded-xl bg-[#1a1d24] text-white text-sm font-medium">Make this video in Content Machine</a>}
                </div>;
              })()}
              {makeErr && <p className="text-sm text-red-700 mt-2">{makeErr}</p>}
              {open.plan.issues.length > 0 && <ul className="text-sm list-disc pl-4 mt-2">{open.plan.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
            </div>}
            {open.plan?.body && <details className="mb-4 rounded-2xl border border-[#e8eaee] p-3"><summary className="text-sm font-medium cursor-pointer">Script or slide copy</summary><p className="text-sm whitespace-pre-wrap leading-relaxed mt-3">{open.plan.body}</p></details>}
            {open.deliveries.length > 0 && (
              <>
                <p className="text-xs font-medium text-[#6b7280] mb-2">Schedule</p>
                <div className="space-y-1.5 mb-5">
                  {open.deliveries.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate">
                        {d.network} · {toDate(d.scheduledUtc).toLocaleString()}
                      </span>
                      <Badge tone={tone(d.status)}>{d.status}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs font-medium text-[#6b7280] mb-2">Captions</p>
            {Object.entries(open.captions).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-[#fafbfc] border border-[#e8eaee] p-3 mb-2">
                <p className="text-[11px] font-medium text-[#9ca3af] mb-1 uppercase">{k}</p>
                {k === "threads" && <p className="text-xs text-[#6b7280] mb-2">Use the full text as a supported attachment or reply chain, rather than one short post. The lead is saved in Notion.</p>}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </Page>
  );
}

export default function SocialPage() {
  return (
    <Suspense>
      <SocialInner />
    </Suspense>
  );
}
