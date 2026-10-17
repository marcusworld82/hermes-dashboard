import { connection } from "next/server";
import { RunsOffError } from "./settings";

// Wraps a route handler: runs at request time, returns JSON, turns errors into plain messages.
export async function handle<T>(fn: () => Promise<T> | T, status = 200) {
  await connection();
  try {
    return Response.json(await fn(), { status });
  } catch (e) {
    const err = e as Error;
    return Response.json({ error: err.message || "Something went wrong.", runsOff: err instanceof RunsOffError }, { status: err instanceof RunsOffError ? 409 : 400 });
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

// The CRM only opens on this Mac. Phones reach the dashboard through Tailscale with a different host name.
export function isLocalHost(host: string | null) {
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
}
