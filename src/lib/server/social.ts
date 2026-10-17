import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { paths } from "./paths";

// Read-only view of the CRM's Social workspace (drafts, captions, scheduled posts).
// Editing and scheduling stay in the CRM, which owns the Postiz connection and its safety checks.

export type SocialPost = {
  id: number;
  title: string;
  format: string;
  brand: string;
  captions: Record<string, string>;
  updatedAt: string;
  deliveries: { network: string; account: string; scheduledUtc: string; timezone: string; status: string; url: string | null; error: string | null }[];
};

function dbFile() {
  return path.join(paths.crmDir, "data/studio.db");
}

export function readSocial(): { ready: boolean; reason: string | null; posts: SocialPost[]; legacy: { id: number; caption: string; scheduledUtc: string; status: string; simulated: boolean }[] } {
  const file = dbFile();
  if (!fs.existsSync(file)) return { ready: false, reason: `CRM database not found at ${file}`, posts: [], legacy: [] };
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const has = (t: string) => !!db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    const posts: SocialPost[] = [];
    if (has("social_drafts")) {
      const drafts = db.prepare("SELECT id, brand, title, format, captions, updated_at FROM social_drafts ORDER BY updated_at DESC LIMIT 200").all() as Record<string, unknown>[];
      const deliveries = has("social_deliveries")
        ? (db.prepare("SELECT draft_id, network, account_name, scheduled_utc, timezone, status, url, error FROM social_deliveries ORDER BY scheduled_utc").all() as Record<string, unknown>[])
        : [];
      for (const d of drafts) {
        let captions: Record<string, string> = {};
        try {
          captions = JSON.parse(String(d.captions));
        } catch {}
        posts.push({
          id: Number(d.id),
          title: String(d.title),
          format: String(d.format),
          brand: String(d.brand),
          captions,
          updatedAt: String(d.updated_at),
          deliveries: deliveries
            .filter((x) => Number(x.draft_id) === Number(d.id))
            .map((x) => ({
              network: String(x.network),
              account: String(x.account_name),
              scheduledUtc: String(x.scheduled_utc),
              timezone: String(x.timezone),
              status: String(x.status),
              url: x.url ? String(x.url) : null,
              error: x.error ? String(x.error) : null,
            })),
        });
      }
    }
    const legacy = has("scheduled_posts")
      ? (db.prepare("SELECT id, caption, scheduled_utc, status, simulated FROM scheduled_posts ORDER BY scheduled_utc DESC LIMIT 100").all() as Record<string, unknown>[]).map((r) => ({
          id: Number(r.id),
          caption: String(r.caption ?? ""),
          scheduledUtc: String(r.scheduled_utc),
          status: String(r.status),
          simulated: !!r.simulated,
        }))
      : [];
    return { ready: true, reason: null, posts, legacy };
  } catch (e) {
    return { ready: false, reason: (e as Error).message, posts: [], legacy: [] };
  } finally {
    db?.close();
  }
}
