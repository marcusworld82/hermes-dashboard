"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { Carousel, Slide } from "@/lib/carousel/types";

export type Step = "ideas" | "news" | "hooks" | "slides" | "slide" | "caption" | "clone";

// Holds the carousel being edited. Edits show at once and save to the server shortly after typing stops.
export function useCarousel(id: string | null) {
  const [car, setCar] = useState<Carousel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsOff, setRunsOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Carousel | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<{ carousel: Carousel }>(`/api/social/carousels/${id}`)
      .then((r) => { if (alive) { latest.current = r.carousel; setCar(r.carousel); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const c = latest.current;
    if (!c) return;
    setSaving(true);
    try {
      const patch: Partial<Carousel> = { ...c };
      delete patch.id; delete patch.createdAt; delete patch.updatedAt; delete patch.status;
      await api(`/api/social/carousels/${c.id}`, { method: "PATCH", json: patch });
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }, []);

  const update = useCallback((patch: Partial<Carousel> | ((c: Carousel) => Partial<Carousel>)) => {
    const cur = latest.current;
    if (!cur) return;
    const p = typeof patch === "function" ? patch(cur) : patch;
    const next = { ...cur, ...p, inputs: { ...cur.inputs, ...(p.inputs ?? {}) } };
    latest.current = next;
    setCar(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  const updateSlide = useCallback((index: number, patch: Partial<Slide>) => {
    update((c) => ({ slides: c.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }, [update]);

  const generate = useCallback(async (step: Step, index?: number) => {
    if (!latest.current) return null;
    await flush();
    setBusy(step + (index ?? ""));
    setError(null);
    try {
      const r = await api<{ carousel: Carousel; flags: string[] }>(`/api/social/carousels/${latest.current.id}/generate`, { method: "POST", json: { step, index } });
      latest.current = r.carousel;
      setCar(r.carousel);
      setRunsOff(false);
      return r;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.runsOff) setRunsOff(true);
      return null;
    } finally { setBusy(null); }
  }, [flush]);

  const replace = useCallback((c: Carousel) => { latest.current = c; setCar(c); }, []);

  return { car, error, setError, runsOff, setRunsOff, busy, setBusy, saving, update, updateSlide, generate, flush, replace };
}

export async function uploadImages(files: FileList | File[]): Promise<string[]> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append("file", f);
  const res = await fetch("/api/social/media", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed.");
  return data.files as string[];
}

export const mediaUrl = (file: string) => `/api/social/media/${file}`;
