// Postiz public API client. Ported from the CRM (src/lib/social-postiz.ts) with its safety checks kept:
// capped responses, ID checks, media rules, and "uncertain" errors that must never be resubmitted blindly.
// The key comes from POSTIZ_API_KEY in .env.local and never leaves the server.

const BASE = "https://api.postiz.com/public/v1";

export class PostizError extends Error {
  uncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; }
}

export type PostizChannel = { id: string; name: string; identifier: string; disabled: boolean; profile: string };
export type PostizMedia = { id: string; path: string };
export type ProviderPost = { id: string; state: string; publishDate: string; releaseURL?: string; integration: { id: string }; content?: string };

const idOk = (s: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(s);
function id(s: string) { if (!idOk(s)) throw new PostizError("Invalid Postiz account or post."); return s; }
const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && (empty || v.length > 0) && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);

export function parsePostizChannels(value: unknown): PostizChannel[] {
  if (!Array.isArray(value) || value.length > 250) throw new PostizError("Postiz channel list could not be read.");
  const ids = new Set<string>();
  return value.map((v) => {
    if (!v || typeof v !== "object" || !text(v.id, 128) || !/^[a-zA-Z0-9_-]+$/.test(v.id) || ids.has(v.id) || !text(v.name, 200) || !text(v.identifier, 64) || !/^[a-z0-9-]+$/.test(v.identifier) || typeof v.disabled !== "boolean" || (v.profile != null && !text(v.profile, 200, true))) throw new PostizError("Postiz channel list could not be read.");
    ids.add(v.id);
    return { id: v.id, name: v.name, identifier: v.identifier, disabled: v.disabled, profile: v.profile ?? "" };
  });
}

export function splitThread(body: string, limit = 500): string[] {
  if (body.length <= limit) return [body];
  const parts: string[] = []; let part = "";
  for (const word of body.trim().split(/\s+/)) {
    if (word.length > limit - 14) throw new PostizError("One word or link is too long for Threads. Shorten it first.");
    if ((part + " " + word).trim().length > limit - 14) { parts.push(part); part = word; }
    else part = (part + " " + word).trim();
  }
  if (part) parts.push(part);
  if (parts.length > 20) throw new PostizError("This caption needs too many parts. Shorten it first.");
  return parts.map((p, i) => `${i + 1}/${parts.length} ${p}`);
}

export function validatePostMedia(network: string, assets: { mime: string }[]) {
  if (!["linkedin", "linkedin-page", "instagram", "instagram-standalone", "facebook", "threads", "tiktok", "tiktok-business", "x"].includes(network)) throw new PostizError("This platform is not supported by this composer yet.");
  if (assets.length > 10) throw new PostizError("Choose up to 10 images.");
  if (assets.some((a) => !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(a.mime))) throw new PostizError("Use JPG, PNG, WebP or MP4 media.");
  if (assets.some((a) => a.mime === "video/mp4") && assets.length !== 1) throw new PostizError("Choose one video, or images only.");
  if (/instagram|tiktok/.test(network) && !assets.length) throw new PostizError("This account requires media. Add an image or MP4 first.");
}

function html(t: string) {
  return t.split(/\n\s*\n/).map((p) => "<p>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") + "</p>").join("");
}

export function postingPayload(channel: PostizChannel, utc: string, caption: string, media: PostizMedia[], aiGenerated: boolean, sponsored: boolean, now = false) {
  const network = channel.identifier;
  const settings: Record<string, unknown> = { __type: network };
  if (/^instagram/.test(network)) Object.assign(settings, { post_type: "post", is_trial_reel: false, collaborators: [] });
  if (/^linkedin/.test(network)) settings.post_as_images_carousel = media.length > 1;
  if (/^tiktok/.test(network)) Object.assign(settings, { title: "", privacy_level: "PUBLIC_TO_EVERYONE", duet: false, stitch: false, comment: true, autoAddMusic: "no", brand_content_toggle: sponsored, brand_organic_toggle: false, video_made_with_ai: aiGenerated, content_posting_method: "DIRECT_POST" });
  const parts = network === "threads" ? splitThread(caption, 500) : [caption];
  return { type: now ? "now" : "schedule", date: utc, shortLink: false, tags: [], posts: [{ integration: { id: channel.id }, value: parts.map((p, i) => ({ content: html(p), image: i === 0 ? media : [] })), settings }] };
}
export type PostingPayload = ReturnType<typeof postingPayload>;

export class PostizClient {
  private key: string;
  private transport: typeof fetch;
  constructor(key: string, transport: typeof fetch = fetch) {
    if (!key || /[\r\n\0]/.test(key)) throw new PostizError("Postiz key is missing or invalid.");
    this.key = key; this.transport = transport;
  }
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const writing = init.method === "POST" || init.method === "DELETE";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), path === "/upload" ? 45000 : 12000);
    try {
      const response = await this.transport(BASE + path, { ...init, redirect: "error", cache: "no-store", signal: controller.signal, headers: { Authorization: this.key, Accept: "application/json", ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}) } });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PostizError(response.status === 401 || response.status === 403 ? "Postiz rejected the key or account access. Check POSTIZ_API_KEY." : response.status === 429 ? "Postiz request limit reached. Try later." : `Postiz request failed (${response.status}).`, writing && (response.status >= 500 || response.status === 408));
      }
      if (init.method === "DELETE") { await response.body?.cancel(); return null; }
      if (!/application\/json/i.test(response.headers.get("content-type") || "")) throw new PostizError("Postiz returned an unexpected response.", writing);
      const reader = response.body?.getReader();
      if (!reader) throw new PostizError("Postiz response was empty.", writing);
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const p = await reader.read(); if (p.done) break;
          bytes += p.value.byteLength;
          if (bytes > 1048576) throw new PostizError("Postiz response exceeded the limit.", writing);
          chunks.push(p.value);
        }
      } finally { void reader.cancel().catch(() => {}); }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.includes(this.key)) throw new PostizError("Postiz returned an unsafe response.", writing);
      try { return JSON.parse(raw); } catch { throw new PostizError("Postiz response could not be read.", writing); }
    } catch (e) {
      if (e instanceof PostizError) throw e;
      throw new PostizError("Postiz could not confirm the request. Check Postiz before trying again.", writing);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  async channels() { return parsePostizChannels(await this.request("/integrations")); }
  async upload(bytes: Buffer, name: string, mime: string): Promise<PostizMedia> {
    const form = new FormData(); form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
    const j = (await this.request("/upload", { method: "POST", body: form })) as PostizMedia;
    if (!j || !idOk(j.id || "") || typeof j.path !== "string" || j.path.length > 4096 || !/^https:\/\//.test(j.path)) throw new PostizError("Postiz upload was not confirmed.");
    const u = new URL(j.path); if (u.username || u.password) throw new PostizError("Postiz returned an invalid media path.");
    return { id: j.id, path: j.path };
  }
  async schedule(payload: PostingPayload): Promise<string> {
    const j = (await this.request("/posts", { method: "POST", body: JSON.stringify(payload) })) as { integration?: string; postId?: string }[];
    if (!Array.isArray(j) || j.length !== 1 || j[0]?.integration !== payload.posts[0].integration.id || !idOk(j[0]?.postId || "")) throw new PostizError("Postiz did not confirm a matching post receipt. Do not submit again.", true);
    return j[0].postId!;
  }
  async cancel(postId: string) { await this.request("/posts/" + id(postId), { method: "DELETE" }); }
  async posts(start: string, end: string): Promise<ProviderPost[]> {
    const j = (await this.request("/posts?" + new URLSearchParams({ startDate: start, endDate: end }))) as { posts?: unknown[] };
    if (!j || !Array.isArray(j.posts) || j.posts.length > 5000) throw new PostizError("Postiz post list could not be read.");
    return j.posts.map((v) => {
      const p = v as ProviderPost;
      if (!idOk(p.id || "") || !idOk(p.integration?.id || "") || !["QUEUE", "PUBLISHED", "ERROR", "DRAFT"].includes(p.state) || !Number.isFinite(Date.parse(p.publishDate))) throw new PostizError("Postiz returned an invalid post state.");
      return { id: p.id, state: p.state, publishDate: p.publishDate, integration: { id: p.integration.id }, content: typeof p.content === "string" ? p.content.slice(0, 20000) : "", releaseURL: typeof p.releaseURL === "string" && /^https:\/\//.test(p.releaseURL) ? p.releaseURL : undefined };
    });
  }
}

export function postizReady() { return !!process.env.POSTIZ_API_KEY; }
export function postizClient() {
  const key = process.env.POSTIZ_API_KEY;
  if (!key) throw new PostizError("Add POSTIZ_API_KEY to .env.local, then restart Hermes.");
  return new PostizClient(key);
}
