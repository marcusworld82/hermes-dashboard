"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  runsOff: boolean;
  constructor(message: string, runsOff = false) {
    super(message);
    this.runsOff = runsOff;
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, !!data?.runsOff);
  return data as T;
}

// Loads JSON from an API route, with optional polling. Keeps old data while refreshing.
export function useApi<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  // Manual refresh, awaited by callers after they change something.
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [url]);

  // Background loading and polling. State is only set from the fetch callbacks.
  useEffect(() => {
    if (!url) return;
    alive.current = true;
    const tick = () =>
      api<T>(url)
        .then((d) => {
          if (alive.current) {
            setData(d);
            setError(null);
          }
        })
        .catch((e: Error) => {
          if (alive.current) setError(e.message);
        });
    tick();
    const t = pollMs
      ? setInterval(() => {
          if (document.visibilityState === "visible") tick();
        }, pollMs)
      : undefined;
    return () => {
      alive.current = false;
      if (t) clearInterval(t);
    };
  }, [pollMs, url]);

  const loading = !!url && data === null && error === null;
  return { data, error, loading, reload: load, setData };
}

export function timeAgo(sec: number | null | undefined) {
  if (!sec) return "";
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
