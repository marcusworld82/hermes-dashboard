import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Turns a reference link or file into plain text for the copy prompt. Capped so one article can't flood the prompt.
const MAX = 20_000;
const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

// Only public internet addresses are allowed. IPv4 private, loopback, link-local, CGNAT, multicast and reserved
// ranges are blocked. For IPv6 only global unicast (2000::/3) is allowed, minus NAT64, 6to4, Teredo and docs ranges;
// IPv4-mapped and embedded IPv4 forms are checked as IPv4.
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (!net.isIPv6(v)) return true;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (tail) return true; // mapped, compatible or embedded IPv4 forms are never needed for a public page
  const first = parseInt(v.split(":")[0] || "0", 16);
  if (!(first >= 0x2000 && first <= 0x3fff)) return true;
  return /^2002:/.test(v) || /^2001:0?0?0?0?:/.test(v) || /^2001:db8:/.test(v) || /^64:ff9b:/.test(v);
}

type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
type Got = { status: number; location: string | null; type: string; body: AsyncIterable<Buffer> & { destroy?: () => void } };
type Requester = (u: URL, safeLookup: (host: string, cb: (err: Error | null, address?: string, family?: number) => void) => void) => Promise<Got>;

const defaultLookup: Lookup = (host) => dns.lookup(host, { all: true });

// The address check runs inside the socket's own lookup, so the connection always goes to the address that passed.
const httpsRequest: Requester = (u, safeLookup) =>
  new Promise((resolve, reject) => {
    const req = https.get(u, { lookup: (h: string, _o: unknown, cb: (err: Error | null, address?: string, family?: number) => void) => safeLookup(h, cb), headers: { "user-agent": "Mozilla/5.0 Hermes reference reader" }, timeout: 10_000 } as https.RequestOptions, (res) =>
      resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null, type: String(res.headers["content-type"] ?? ""), body: res }));
    req.on("timeout", () => req.destroy(new Error("The page took too long to answer.")));
    req.on("error", (e) => reject(e.message.includes("private address") ? e : new Error(`Couldn't open that link (${e.message}).`)));
  });

// Follows up to 3 redirects by hand so every hop goes through the same address check.
export async function fetchReference(url: string, request: Requester = httpsRequest, lookup: Lookup = defaultLookup): Promise<string> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("That link isn't valid."); }
  const safeLookup = (host: string, cb: (err: Error | null, address?: string, family?: number) => void) => {
    const h = host.replace(/^\[|\]$/g, "");
    (net.isIP(h) ? Promise.resolve([{ address: h, family: net.isIP(h) }]) : lookup(h))
      .then((addrs) => {
        if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) return cb(new Error("That link points at a private address."));
        cb(null, addrs[0].address, addrs[0].family);
      }, () => cb(new Error("That site couldn't be found.")));
  };
  let res: Got | null = null;
  for (let hop = 0; hop < 4; hop++) {
    if (u.protocol !== "https:") throw new Error("Use an https link.");
    if (u.username || u.password) throw new Error("Links with passwords aren't allowed.");
    const h = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(h) && isPrivateIp(h)) throw new Error("That link points at a private address.");
    res = await request(u, safeLookup);
    if (res.status >= 300 && res.status < 400 && res.location) {
      res.body.destroy?.();
      u = new URL(res.location, u);
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new Error("That link redirects too many times.");
  if (res.status < 200 || res.status >= 300) { res.body.destroy?.(); throw new Error(`The page answered ${res.status}.`); }
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const c of res.body) {
    chunks.push(c); bytes += c.length;
    if (bytes > 2 * 1024 * 1024) { res.body.destroy?.(); break; }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const text = /html/i.test(res.type || "html") ? strip(raw) : raw;
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
