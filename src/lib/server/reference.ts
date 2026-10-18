import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Turns a reference link or file into plain text for the copy prompt. Capped so one article can't flood the prompt.
const MAX = 20_000;
const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

export async function fetchReference(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("That link isn't valid."); }
  if (u.protocol !== "https:") throw new Error("Use an https link.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(u.hostname)) throw new Error("That link points at a private address.");
  const res = await fetcher(u, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 Hermes reference reader" } });
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("The page was empty.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  for (;;) {
    const p = await reader.read(); if (p.done) break;
    bytes += p.value.byteLength; chunks.push(p.value);
    if (bytes > 2 * 1024 * 1024) { void reader.cancel(); break; }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const text = /html/i.test(res.headers.get("content-type") || "html") ? strip(raw) : raw;
  if (!text) throw new Error("No readable text on that page.");
  return text.slice(0, MAX);
}

export async function fileToText(bytes: Buffer, mime: string, name: string): Promise<string> {
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Files must be 15 MB or smaller.");
  if (/^text\//.test(mime) || /\.(md|txt)$/i.test(name)) return bytes.toString("utf8").slice(0, MAX);
  const ext = /\.pdf$/i.test(name) || mime === "application/pdf" ? "pdf" : /\.docx$/i.test(name) ? "docx" : "";
  if (!ext) throw new Error("Use a PDF, DOCX, TXT or MD file.");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-ref-"));
  const file = path.join(tmp, `ref.${ext}`);
  fs.writeFileSync(file, bytes);
  try {
    const [bin, args] = ext === "pdf" ? ["/opt/homebrew/bin/pdftotext", [file, "-"]] : ["/usr/bin/textutil", ["-convert", "txt", "-stdout", file]];
    if (!fs.existsSync(bin)) throw new Error(`${ext.toUpperCase()} reading isn't available on this Mac.`);
    const out = await new Promise<string>((resolve, reject) => execFile(bin, args, { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 }, (e, so) => (e ? reject(new Error(`Couldn't read that ${ext.toUpperCase()}.`)) : resolve(so))));
    return out.replace(/\s+/g, " ").trim().slice(0, MAX);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
