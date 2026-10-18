"use client";
/* eslint-disable @next/next/no-img-element -- slide previews are blob and API URLs that next/image cannot optimize */

import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Card, Empty, ErrorNote, Page, PageHeader } from "@/components/ui";
import type { Carousel } from "@/lib/carousel/types";

type Rec = { id: string; carouselId: string; state: string; when: string; error: string | null };

export default function HistoryPage() {
  const router = useRouter();
  const list = useApi<{ carousels: Carousel[] }>("/api/social/carousels");
  const posts = useApi<{ records: Rec[] }>("/api/social/postiz/posts");
  const recs = posts.data?.records ?? [];
  const dup = async (id: string) => { const r = await api<{ carousel: Carousel }>(`/api/social/carousels/${id}`, { method: "PATCH", json: { duplicate: true } }); router.push(`/social/carousels?id=${r.carousel.id}`); };
  const del = async (c: Carousel) => { if (!confirm(`Delete "${c.title || "Untitled carousel"}"? Posts already sent stay on Instagram.`)) return; await api(`/api/social/carousels/${c.id}`, { method: "DELETE" }); await list.reload(); };
  const carousels = list.data?.carousels ?? [];
  return (
    <Page wide>
      <PageHeader title="History" sub="Every carousel made in Hermes, with what was posted or scheduled." />
      <ErrorNote text={list.error} />
      {list.data && carousels.length === 0 ? <Empty title="No carousels yet" sub="Make one on the Carousels tab." /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {carousels.map((c) => {
            const last = recs.filter((r) => r.carouselId === c.id).sort((a, b) => b.when.localeCompare(a.when))[0];
            return (
              <Card key={c.id} className="overflow-hidden">
                <button className="block w-full" onClick={() => router.push(`/social/carousels?id=${c.id}`)}>
                  {c.slides.length ? <img src={`/api/social/carousels/${c.id}/slides/0`} alt="" decoding="async" className="w-full aspect-[3/4] object-cover bg-[#f4f5f7]" /> : <div className="w-full aspect-[3/4] bg-[#f4f5f7] flex items-center justify-center text-xs text-[#9ca3af]">No slides yet</div>}
                </button>
                <div className="p-3">
                  <p className="font-medium text-sm truncate">{c.title || "Untitled carousel"}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge tone={c.status === "posted" ? "green" : c.status === "scheduled" ? "blue" : "gray"}>{c.status}</Badge>
                    {last && <span className="text-[11px] text-[#6b7280]">{new Date(last.when).toLocaleString()}</span>}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="ghost" onClick={() => void dup(c.id)}><Copy size={13} /> Duplicate</Button>
                    <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => void del(c)}><Trash2 size={13} /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
