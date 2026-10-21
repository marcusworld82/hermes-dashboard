import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { requireRuns } from "./settings";
import { claudeSend } from "./models";
import { getBanned } from "./banned-store";
import { getBrandKit } from "./brand-kits";
import type { Deps } from "./carousel-ai";

// Real dependencies for the copy writer: Claude on this Mac, the brand kit, the banned list and the brand notes.
const NOTES = ["AI Brain/2026-10-16-marcus-personal-brand-foundation.md", "AI Brain/2026-10-18-marcus-brand-editorial-rules.md"];

export function carouselDeps(brandId: string): Deps {
  const foundation = NOTES.map((n) => { try { return fs.readFileSync(path.join(paths.vault, n), "utf8"); } catch { return ""; } }).filter(Boolean).join("\n\n---\n\n");
  return { send: (prompt, opts) => claudeSend(prompt, { ...opts, agentId: "maya" }), requireRuns, brand: getBrandKit(brandId), banned: getBanned(), foundation, mediaDir: path.join(paths.data, "social-media") };
}
