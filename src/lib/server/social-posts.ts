import { readJson, updateJson, newId } from "./store.ts";
import { postingPayload, validatePostMedia, PostizError, type PostizChannel, type PostizMedia } from "./postiz.ts";

// Every post Hermes sends to Postiz. The record is saved before anything is uploaded,
// so a timeout can never turn into a silent double post.

export type PostState = "submitting" | "scheduled" | "uncertain" | "failed" | "canceled";
export type PostRecord = {
  id: string;
  carouselId: string;
  channelIds: string[];
  when: string;
  now: boolean;
  caption: string;
  state: PostState;
  postizIds: string[];
  error: string | null;
  overrideReason: string | null;
  createdAt: string;
};

type Client = {
  channels(): Promise<PostizChannel[]>;
  upload(bytes: Buffer, name: string, mime: string): Promise<PostizMedia>;
  schedule(payload: ReturnType<typeof postingPayload>): Promise<string>;
};

export type ScheduleInput = { carouselId: string; channelIds: string[]; when: string; now: boolean; caption: string; slides: Buffer[]; aiGenerated?: boolean; overrideReason?: string | null };

const FILE = "social-posts";
export const listPostRecords = () => readJson<PostRecord[]>(FILE, []);
const save = (rec: PostRecord) => updateJson<PostRecord[]>(FILE, [], (all) => [...all.filter((r) => r.id !== rec.id), rec]);

export function blockIfPending(carouselId: string) {
  if (listPostRecords().some((r) => r.carouselId === carouselId && (r.state === "submitting" || r.state === "uncertain")))
    throw new PostizError("This carousel has a post in progress or unconfirmed. Check Postiz before trying again.");
}

// Marks an uncertain record as resolved after Marcus checks Postiz himself.
export function resolveRecord(id: string, state: "scheduled" | "failed") {
  const rec = listPostRecords().find((r) => r.id === id);
  if (!rec) throw new Error("Post record not found.");
  save({ ...rec, state, error: state === "failed" ? rec.error ?? "Marked as not posted." : null });
}

export async function schedulePost(input: ScheduleInput, client: Client): Promise<PostRecord> {
  if (!input.channelIds.length) throw new PostizError("Pick at least one account.");
  if (!input.now && !Number.isFinite(Date.parse(input.when))) throw new PostizError("Pick a valid date and time.");
  if (!input.now && Date.parse(input.when) < Date.now() - 60_000) throw new PostizError("That time is in the past.");
  blockIfPending(input.carouselId);
  const rec: PostRecord = {
    id: newId("post"), carouselId: input.carouselId, channelIds: input.channelIds, when: input.now ? new Date().toISOString() : input.when, now: input.now,
    caption: input.caption, state: "submitting", postizIds: [], error: null, overrideReason: input.overrideReason ?? null, createdAt: new Date().toISOString(),
  };
  save(rec);
  try {
    const channels = await client.channels();
    const picked = input.channelIds.map((cid) => {
      const c = channels.find((x) => x.id === cid);
      if (!c || c.disabled) throw new PostizError("One of the chosen accounts is missing or disabled in Postiz.");
      validatePostMedia(c.identifier, input.slides.map(() => ({ mime: "image/png" })));
      return c;
    });
    const media: PostizMedia[] = [];
    for (const [i, png] of input.slides.entries()) media.push(await client.upload(png, `slide-${i + 1}.png`, "image/png"));
    for (const c of picked) {
      rec.postizIds.push(await client.schedule(postingPayload(c, rec.when, input.caption, media, !!input.aiGenerated, false, input.now)));
      save(rec);
    }
    rec.state = "scheduled";
  } catch (e) {
    const err = e instanceof PostizError ? e : new PostizError("Posting stopped unexpectedly. Check Postiz before trying again.", true);
    rec.state = err.uncertain || rec.postizIds.length ? "uncertain" : "failed";
    rec.error = err.message;
  }
  save(rec);
  return rec;
}
