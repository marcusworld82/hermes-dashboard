import crypto from "node:crypto";
import { saveMedia } from "./carousels.ts";
import { updateJson } from "./store.ts";
import type { Size } from "../carousel/types.ts";

// Optional paid image route. Every run starts with Higgsfield's estimate endpoint (free, generates nothing),
// shows the price, and only generates when Marcus clicks Generate on that quote. Each quote can be used once.
// Submissions send an Idempotency-Key and are never retried automatically.

const API = "https://api.higgsfield.ai";

export const HF_MODELS = [
  { id: "flare", name: "2.5 Flare (Marketing Studio)", endpoint: "marketing-studio/image/flare", ratios: ["3:4"], extra: { resolution: "2k", quality: "high" } },
  { id: "soul2", name: "Soul 2", endpoint: "higgsfield-ai/soul/v2/standard", ratios: ["3:4"], extra: {} },
  { id: "ideogram4", name: "Ideogram 4.0", endpoint: "ideogram/v4.0", ratios: ["3:4", "4:5"], extra: {} },
  { id: "recraft41", name: "Recraft 4.1", endpoint: "recraft/v4.1/text-to-image", ratios: ["3:4", "4:5"], extra: {} },
  { id: "grok2", name: "Grok Image 2.0", endpoint: "xai/grok-imagine-image-2.0", ratios: ["3:4"], extra: {} },
] as const;
export type HfModelId = (typeof HF_MODELS)[number]["id"];

export type Quote = { quoteId: string; model: HfModelId; credits: number | null; usd: number | null; description: string | null; expiresAt: number };
type Pending = Quote & { body: Record<string, unknown> };
// Shared across route bundles so a quote made by one route can be spent by another.
const g = globalThis as { __hermesHfQuotes?: Map<string, Pending> };
const quotes = (g.__hermesHfQuotes ??= new Map<string, Pending>());

export const higgsfieldReady = () => !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);
export function hfAuth() {
  const id = process.env.HF_API_KEY_ID?.trim(), secret = process.env.HF_API_KEY_SECRET?.trim();
  if (!id || !secret) throw new Error("Add HF_API_KEY_ID and HF_API_KEY_SECRET to .env.local, then restart Hermes.");
  return `Key ${id}:${secret}`;
}

const model = (id: string) => {
  const m = HF_MODELS.find((x) => x.id === id);
  if (!m) throw new Error("Pick a Higgsfield model.");
  return m;
};
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function requestBody(id: HfModelId, prompt: string, size: Size) {
  const m = model(id);
  const ratio = (m.ratios as readonly string[]).includes(size) ? size : "3:4";
  return { prompt: `${prompt.slice(0, 2000)}. No words, letters or logos in the image.`, aspect_ratio: ratio, ...m.extra };
}

export async function quote(id: HfModelId, prompt: string, size: Size, fetcher: typeof fetch = fetch): Promise<Quote> {
  if (!prompt.trim()) throw new Error("Describe the image first.");
  const m = model(id);
  const body = requestBody(id, prompt, size);
  const res = await fetcher(`${API}/estimate/${m.endpoint}`, { method: "POST", headers: { Authorization: hfAuth(), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Higgsfield rejected the key. Check HF_API_KEY_ID and HF_API_KEY_SECRET." : `Higgsfield couldn't price this (${res.status}).`);
  const j = (await res.json()) as Record<string, unknown>;
  const q: Pending = {
    quoteId: crypto.randomUUID(), model: id, credits: num(j.credits), usd: num(j.usd),
    description: typeof j.pricing_description === "string" ? j.pricing_description.slice(0, 500) : null,
    expiresAt: Date.now() + 10 * 60_000, body,
  };
  if (q.usd === null && q.credits === null && !q.description) throw new Error("Higgsfield didn't return a price. Nothing was generated.");
  quotes.set(q.quoteId, q);
  return { quoteId: q.quoteId, model: q.model, credits: q.credits, usd: q.usd, description: q.description, expiresAt: q.expiresAt };
}

type GenOpts = { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> };

export async function generateWithHiggsfield(quoteId: string, opts: GenOpts = {}): Promise<{ file: string; requestId: string }> {
  const fetcher = opts.fetcher ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const q = quotes.get(quoteId);
  quotes.delete(quoteId);
  if (!q || q.expiresAt < Date.now()) throw new Error("Get a fresh price before generating.");
  const auth = hfAuth();
  const m = model(q.model);
  let submitted: { request_id?: string; status_url?: string };
  try {
    const res = await fetcher(`${API}/${m.endpoint}`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": q.quoteId }, body: JSON.stringify(q.body), signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(String(res.status));
    submitted = (await res.json()) as typeof submitted;
  } catch {
    throw new Error("Higgsfield didn't confirm the request. Check Higgsfield before trying again, so you aren't charged twice.");
  }
  const requestId = String(submitted.request_id ?? "");
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw new Error("Higgsfield didn't confirm the request. Check Higgsfield before trying again, so you aren't charged twice.");
  updateJson<{ requestId: string; model: string; at: string; usd: number | null }[]>("higgsfield-requests", [], (all) => [...all.slice(-200), { requestId, model: q.model, at: new Date().toISOString(), usd: q.usd }]);
  const statusUrl = `${API}/requests/${requestId}/status`;
  const deadline = Date.now() + 5 * 60_000;
  let wait = 2000;
  for (;;) {
    await sleep(wait);
    wait = Math.min(10_000, Math.round(wait * 1.5));
    let s: { status?: string; images?: { url?: string }[] } = {};
    try {
      const r = await fetcher(statusUrl, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (r.ok) s = (await r.json()) as typeof s;
    } catch {}
    if (s.status === "completed") {
      const url = s.images?.[0]?.url;
      if (!url || !/^https:\/\//.test(url)) throw new Error("Higgsfield finished but returned no image.");
      const img = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
      const type = img.headers.get("content-type") || "image/png";
      const bytes = Buffer.from(await img.arrayBuffer());
      return { ...saveMedia(bytes, /jpe?g/.test(type) ? "image/jpeg" : /webp/.test(type) ? "image/webp" : "image/png", "higgsfield"), requestId };
    }
    if (s.status === "failed" || s.status === "nsfw" || s.status === "canceled") throw new Error(s.status === "nsfw" ? "Higgsfield blocked this image for content. You weren't charged." : "Higgsfield couldn't make this image. You weren't charged.");
    if (Date.now() > deadline) throw new Error(`Still generating on Higgsfield (request ${requestId}). Check it there; Hermes won't submit again.`);
  }
}
