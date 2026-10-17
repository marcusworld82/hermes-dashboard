"use client";

import { Suspense, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useApi } from "@/lib/client";
import { Badge, Card, Empty, ErrorNote, Page, PageHeader, Segmented, Sheet, cx } from "@/components/ui";

type Delivery = { network: string; account: string; scheduledUtc: string; timezone: string; status: string; url: string | null; error: string | null };
type Post = { id: number; title: string; format: string; brand: string; captions: Record<string, string>; updatedAt: string; deliveries: Delivery[] };
type Data = { ready: boolean; reason: string | null; posts: Post[]; legacy: { id: number; caption: string; scheduledUtc: string; status: string; simulated: boolean }[]; crmUrl: string };

const tone = (s: string) => (s === "published" ? "green" : s === "scheduled" ? "blue" : s === "failed" ? "red" : s === "canceled" ? "gray" : "amber") as "green" | "blue" | "red" | "gray" | "amber";
const toDate = (utc: string) => new Date(utc.endsWith("Z") || utc.includes("+") ? utc : `${utc.replace(" ", "T")}Z`);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function SocialInner() {
  const { data, error } = useApi<Data>("/api/social", 60_000);
  const [view, setView] = useState<"calendar" | "posts">("calendar");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [open, setOpen] = useState<Post | null>(null);
  const [nowMs] = useState(() => Date.now());

  const posts = data?.posts ?? [];
  const events = posts.flatMap((p) => p.deliveries.map((d) => ({ post: p, d, at: toDate(d.scheduledUtc) })));
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
        sub="Your schedule, drafts and captions from the CRM's Social workspace. Postiz publishes on time even when your Mac is off."
        action={
          <a href={`${data?.crmUrl ?? "http://127.0.0.1:3100"}/social`} target="_blank" rel="noreferrer" className="hidden md:inline-flex items-center gap-1.5 min-h-11 px-4 rounded-2xl text-sm font-medium bg-white border border-[#e8eaee]">
            Edit in CRM <ExternalLink size={14} />
          </a>
        }
      />
      <ErrorNote text={error || (data && !data.ready ? data.reason : null)} />
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
                    {list.slice(0, 3).map((e, j) => (
                      <button key={j} onClick={() => setOpen(e.post)} className="block w-full text-left text-[11px] truncate rounded-lg bg-white border border-[#e8eaee] px-1.5 py-1 mt-1">
                        {e.d.network} · {e.post.title}
                      </button>
                    ))}
                    {list.length > 3 && <p className="text-[10px] text-[#9ca3af] px-1 mt-1">+{list.length - 3} more</p>}
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="md:hidden space-y-2">
            {upcoming.length === 0 && (
              <Card>
                <Empty title="Nothing scheduled" sub="Schedule posts in the CRM on your Mac. They show up here." />
              </Card>
            )}
            {upcoming.map((e, i) => (
              <Card key={i} className="p-3.5" onClick={() => setOpen(e.post)}>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#6b7280]">{e.at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
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
            <p className="hidden md:block text-sm text-[#9ca3af] mt-3">Nothing scheduled yet. Scheduled posts from the CRM appear on this calendar.</p>
          )}
        </>
      ) : posts.length === 0 ? (
        <Card>
          <Empty title="No drafts yet" sub="Drafts and captions you write in the CRM's Social workspace show up here." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4" onClick={() => setOpen(p)}>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="purple">{p.format}</Badge>
                <Badge>{p.brand}</Badge>
                <span className="text-[11px] text-[#9ca3af] ml-auto">{p.deliveries.length} scheduled</span>
              </div>
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-[#6b7280] mt-1 line-clamp-3">{Object.values(p.captions)[0] ?? "No caption yet"}</p>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""}>
        {open && (
          <div>
            <div className="flex gap-2 mb-4">
              <Badge tone="purple">{open.format}</Badge>
              <Badge>{open.brand}</Badge>
            </div>
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
