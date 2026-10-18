import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths.ts";
import { saveMedia } from "./carousels.ts";
import type { Size } from "../carousel/types.ts";

// Default image route: Codex's built-in image tool on Marcus's ChatGPT plan. No API key and no per-image charge.
// Codex saves each run's images in ~/.codex/generated_images/<thread id>/; the thread id comes from `codex exec --json`.

type Opts = { run?: (prompt: string) => Promise<string>; codexHome?: string };

function execCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cwd = path.join(paths.data, "agent-scratch");
    fs.mkdirSync(cwd, { recursive: true });
    const child = execFile(paths.codexBin, ["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "-"], { cwd, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error(/usage limit|rate limit/i.test(String(errOut) + String(out)) ? "Your ChatGPT plan's image limit was reached. Try later or use Higgsfield." : `Codex couldn't make the image (${(String(errOut) || err.message).trim().split("\n").slice(-1)[0]}).`));
      resolve(String(out));
    });
    child.stdin?.end(prompt);
  });
}

export function codexPrompt(prompt: string, size: Size) {
  return [
    "Use your built-in image generation tool to create exactly one image. Do not run commands or write files.",
    `Aspect ratio: ${size === "4:5" ? "4:5" : "3:4"} portrait.`,
    "It is the photo for an Instagram carousel slide, so keep the main subject clear and leave calm space where headline text can sit. Do not put any words, letters or logos in the image.",
    `Image: ${prompt}`,
  ].join("\n");
}

export async function generateWithCodex(prompt: string, size: Size, opts: Opts = {}): Promise<{ file: string }> {
  if (!prompt.trim()) throw new Error("Describe the image first.");
  const started = Date.now();
  const out = await (opts.run ?? execCodex)(codexPrompt(prompt.slice(0, 2000), size));
  const thread = /"thread_id"\s*:\s*"([0-9a-f-]{36})"/i.exec(out)?.[1];
  const home = opts.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const dir = thread ? path.join(home, "generated_images", thread) : null;
  const pngs = dir && fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs })).filter((x) => x.t >= started - 5000).sort((a, b) => b.t - a.t)
    : [];
  if (!pngs.length) throw new Error("Codex didn't return an image. Try again or use Higgsfield.");
  const bytes = fs.readFileSync(pngs[0].f);
  const ext = path.extname(pngs[0].f).toLowerCase();
  return saveMedia(bytes, ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg", path.basename(pngs[0].f));
}
