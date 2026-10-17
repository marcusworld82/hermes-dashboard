import { handle, body } from "@/lib/server/http";
import { connections } from "@/lib/server/connections";
import { addMcp } from "@/lib/server/hermes";

export async function GET() {
  return handle(() => connections());
}

export async function POST(req: Request) {
  const b = await body<{ name?: string; url?: string; command?: string; args?: string }>(req);
  return handle(async () => {
    const name = String(b.name ?? "").trim();
    if (!/^[\w.-]{1,40}$/.test(name)) throw new Error("Use a short name with letters, numbers, dots or dashes.");
    if (!b.url && !b.command) throw new Error("Add a URL or a command.");
    if (b.url && !/^https?:\/\//.test(b.url)) throw new Error("The URL must start with http:// or https://");
    const out = await addMcp({ name, url: b.url || undefined, command: b.command || undefined, args: b.args ? b.args.split(/\s+/).filter(Boolean) : undefined });
    return { ok: true, output: out.slice(-1500) };
  });
}
