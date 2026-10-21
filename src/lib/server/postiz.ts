// Postiz public API client. Ported from the CRM (src/lib/social-postiz.ts) with its safety checks kept:
// capped responses, ID checks, media rules, and "uncertain" errors that must never be resubmitted blindly.
// The key comes from POSTIZ_API_KEY in .env.local and never leaves the server.

const BASE = "https://api.postiz.com/public/v1";

export class PostizError extends Error {
  uncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; }
}

export type PostizChannel = { id: string; name: string; identifier: string; disabled: boolean; profile: string };
export type PostizMedia = { id: string; path: string; thumbnail?: string };
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

// Every Postiz option Marcus OS exposes, per network. Defaults match what Marcus OS sent before these options existed.
export type PostOptions = {
  draft: boolean;
  comments: string[];
  instagram: { postType: "post" | "story"; trialReel: boolean; graduation: "MANUAL" | "SS_PERFORMANCE"; collaborators: string[] };
  tiktok: { title: string; privacy: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY"; duet: boolean; stitch: boolean; comment: boolean; autoAddMusic: boolean; method: "DIRECT_POST" | "UPLOAD" };
  linkedin: { carousel: boolean | null };
  x: { whoCanReply: "everyone" | "following" | "mentionedUsers" | "subscribers" | "verified"; community: string };
  facebook: { postType: "post" | "story" };
};
export const DEFAULT_POST_OPTIONS: PostOptions = {
  draft: false, comments: [],
  instagram: { postType: "post", trialReel: false, graduation: "MANUAL", collaborators: [] },
  tiktok: { title: "", privacy: "PUBLIC_TO_EVERYONE", duet: false, stitch: false, comment: true, autoAddMusic: false, method: "DIRECT_POST" },
  linkedin: { carousel: null },
  x: { whoCanReply: "everyone", community: "" },
  facebook: { postType: "post" },
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

// Accepts options from the browser. Anything unknown falls back to the safe default.
export function cleanPostOptions(raw: unknown): PostOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | unknown>;
  const o = (k: string) => (r[k] && typeof r[k] === "object" ? r[k] : {}) as Record<string, unknown>;
  const d = DEFAULT_POST_OPTIONS;
  const comments = (Array.isArray(r.comments) ? r.comments : []).map((c) => String(c ?? "").trim()).filter(Boolean);
  if (comments.length > 2 || comments.some((c) => c.length > 2200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(c))) throw new PostizError("Use up to two comments, 2,200 characters each.");
  const ig = o("instagram"), tt = o("tiktok"), x = o("x");
  const collaborators = (Array.isArray(ig.collaborators) ? ig.collaborators : []).map((c) => String(c).trim().replace(/^@/, "")).filter(Boolean);
  if (collaborators.length > 3 || collaborators.some((c) => !/^[A-Za-z0-9._]{1,30}$/.test(c))) throw new PostizError("Add up to 3 Instagram collaborators by username.");
  const title = String(tt.title ?? "");
  if (title.length > 90) throw new PostizError("TikTok titles are 90 characters or fewer.");
  const community = String(x.community ?? "").trim();
  if (community && !/^https:\/\/x\.com\/i\/communities\/\d+$/.test(community)) throw new PostizError("X community must look like https://x.com/i/communities/123.");
  const li = o("linkedin");
  return {
    draft: bool(r.draft, false), comments,
    instagram: { postType: pick(ig.postType, ["post", "story"], d.instagram.postType), trialReel: bool(ig.trialReel, false), graduation: pick(ig.graduation, ["MANUAL", "SS_PERFORMANCE"], "MANUAL"), collaborators },
    tiktok: { title, privacy: pick(tt.privacy, ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"], d.tiktok.privacy), duet: bool(tt.duet, false), stitch: bool(tt.stitch, false), comment: bool(tt.comment, true), autoAddMusic: bool(tt.autoAddMusic, false), method: pick(tt.method, ["DIRECT_POST", "UPLOAD"], "DIRECT_POST") },
    linkedin: { carousel: typeof li.carousel === "boolean" ? li.carousel : null },
    x: { whoCanReply: pick(x.whoCanReply, ["everyone", "following", "mentionedUsers", "subscribers", "verified"], "everyone"), community },
    facebook: { postType: pick(o("facebook").postType, ["post", "story"], "post") },
  };
}

// Trial reels only exist for a single Instagram video posted to the feed.
export function assertOptionsFit(opts: PostOptions, hasVideo: boolean) {
  if (opts.instagram.trialReel && (!hasVideo || opts.instagram.postType !== "post")) throw new PostizError("Trial reels need one video posted as a feed post, not images or a story.");
}

export function postingPayload(channel: PostizChannel, utc: string, caption: string, media: PostizMedia[], aiGenerated: boolean, sponsored: boolean, now = false, opts: PostOptions = DEFAULT_POST_OPTIONS) {
  const network = channel.identifier;
  const settings: Record<string, unknown> = { __type: network };
  if (/^instagram/.test(network)) Object.assign(settings, { post_type: opts.instagram.postType, is_trial_reel: opts.instagram.trialReel, ...(opts.instagram.trialReel ? { graduation_strategy: opts.instagram.graduation } : {}), collaborators: opts.instagram.collaborators.map((label) => ({ label })) });
  if (/^linkedin/.test(network)) settings.post_as_images_carousel = opts.linkedin.carousel ?? media.length > 1;
  if (/^tiktok/.test(network)) Object.assign(settings, { title: opts.tiktok.title, privacy_level: opts.tiktok.privacy, duet: opts.tiktok.duet, stitch: opts.tiktok.stitch, comment: opts.tiktok.comment, autoAddMusic: opts.tiktok.autoAddMusic ? "yes" : "no", brand_content_toggle: sponsored, brand_organic_toggle: false, video_made_with_ai: aiGenerated, content_posting_method: opts.tiktok.method });
  if (network === "x") Object.assign(settings, { who_can_reply_post: opts.x.whoCanReply, ...(opts.x.community ? { community: opts.x.community } : {}), made_with_ai: aiGenerated });
  if (network === "facebook") settings.post_type = opts.facebook.postType;
  const parts = network === "threads" ? splitThread(caption, 500) : [caption];
  // Extra parts become comments or thread replies. TikTok and YouTube do not support them, and stories have no comments.
  const story = (/^instagram/.test(network) && opts.instagram.postType === "story") || (network === "facebook" && opts.facebook.postType === "story");
  const comments = /^(tiktok|youtube)/.test(network) || story ? [] : opts.comments.flatMap((c) => (network === "threads" ? splitThread(c, 500) : [c]));
  const value = [...parts, ...comments].map((p, i) => ({ content: html(p), image: i === 0 ? media : [] }));
  return { type: opts.draft ? "draft" : now ? "now" : "schedule", date: utc, shortLink: false, tags: [], posts: [{ integration: { id: channel.id }, value, settings }] };
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
  if (!key) throw new PostizError("Add POSTIZ_API_KEY to .env.local, then restart Marcus OS.");
  return new PostizClient(key);
}
