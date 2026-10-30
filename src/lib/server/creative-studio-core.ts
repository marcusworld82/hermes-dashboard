import { createHash, randomUUID } from "node:crypto";

export type Payload = Record<string, unknown>;
export type JobStatus = "submitting" | "uncertain" | "queued" | "in_progress" | "persisting" | "completed" | "failed" | "nsfw" | "canceled";
export type SavedOutput = { key: string; contentType: string; bytes: number; width?: number; height?: number };
export type StudioJob = { id: string; idempotencyKey: string; quoteId: string; fingerprint: string; model: string; payload: Payload; usd: number; month: string; status: JobStatus; createdAt: number; updatedAt: number; requestId?: string; statusUrl?: string; outputs?: SavedOutput[]; error?: string; nextPollAt?: number; pollDelayMs?: number; redoOf?: string };
export type StudioQuote = { id: string; model: string; payload: Payload; fingerprint: string; usd: number; expiresAt: number; usedBy?: string };
export type StudioState = { jobs: StudioJob[]; quotes: StudioQuote[] };
/** Must atomically commit the mutation before resolving, across processes/restarts.
 * A thrown callback must roll back completely. Return detached values to callers.
 * Never back this with globalThis, serverless /tmp, or a read/write Blob pair without CAS. */
export interface StudioStore { durable: boolean; transaction<T>(mutate: (state: StudioState) => T): Promise<T>; read(): Promise<StudioState>; saveOutputs(jobId: string, outputs: unknown, payload: Payload): Promise<SavedOutput[]> }
export interface StudioProvider { estimate(model: string, payload: Payload): Promise<unknown>; submit(model: string, payload: Payload, idempotencyKey: string): Promise<{ request_id: string; status_url: string }>; poll(statusUrl: string): Promise<{ status: string; outputs?: unknown }> }
/** Installed by owner code only, after checking the model's current official schema. */
export interface StudioModel { id: string; endpoint: string; source: string; verifiedAt: string; validate(payload: Payload): boolean }
export class StudioError extends Error { code: string; status: number; constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; } }
const terminalFailure = (s: JobStatus) => ["failed", "nsfw", "canceled"].includes(s);
const active = (s: JobStatus) => !["completed", "failed", "nsfw", "canceled"].includes(s);
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Payload)[k])}`).join(",")}}`;
}
export const fingerprint = (model: string, payload: Payload) => createHash("sha256").update(canonical({ model, payload })).digest("hex");
export function safeStatusUrl(raw: string) { const u = new URL(raw); if (u.protocol !== "https:" || u.hostname !== "api.higgsfield.ai" || u.username || u.password || u.port || u.hash) throw new StudioError("UNSAFE_STATUS_URL", "Provider returned an untrusted status URL."); return raw; }
export class CreativeStudio {
  private store: StudioStore; private provider: StudioProvider; private models: StudioModel[]; private budgetUsd: number; private now: () => number;
  constructor(store: StudioStore, provider: StudioProvider, models: StudioModel[], budgetUsd: number, now = Date.now) { this.store = store; this.provider = provider; this.models = models; this.budgetUsd = budgetUsd; this.now = now; }
  private ready() { if (!this.store.durable) throw new StudioError("STORAGE_UNAVAILABLE", "Durable Studio storage is unavailable. No generation was submitted.", 503); if (!Number.isFinite(this.budgetUsd) || this.budgetUsd <= 0) throw new StudioError("BUDGET_UNAVAILABLE", "Set a monthly Studio budget first.", 503); }
  private model(id: string, payload: Payload) { const m = this.models.find(x => x.id === id); if (!m || !m.source.startsWith("https://") || !Number.isFinite(Date.parse(m.verifiedAt)) || !m.validate(payload)) throw new StudioError("INVALID_MODEL_INPUT", "Use an installed model profile and its verified input schema.", 400); return m; }
  async quote(model: string, payload: Payload) {
    this.ready(); const profile = this.model(model, payload);
    // Snapshot before estimate: caller mutations cannot change the paid payload.
    const body = JSON.parse(JSON.stringify(payload)) as Payload;
    const fp = fingerprint(`${model}:${profile.endpoint}`, body), now = this.now();
    const cached = (await this.store.read()).quotes.find(q => q.fingerprint === fp && q.expiresAt > now && !q.usedBy);
    if (cached) return structuredClone(cached);
    const estimate = await this.provider.estimate(model, body);
    const usd = (estimate as { usd?: unknown } | null)?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) throw new StudioError("PRICE_UNKNOWN", "Higgsfield did not return a numeric USD estimate. Paid submission is disabled.", 422);
    const q: StudioQuote = { id: randomUUID(), model, payload: body, fingerprint: fp, usd, expiresAt: now + 600_000 };
    await this.store.transaction(state => { state.quotes = state.quotes.filter(q => q.expiresAt > now); state.quotes.push(q); });
    return structuredClone(q);
  }
  async submit(input: { quoteId: string; idempotencyKey: string; confirmOverDollar?: boolean; confirmBudget?: boolean; redoOf?: string }) {
    this.ready();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey)) throw new StudioError("IDEMPOTENCY_REQUIRED", "Use a stable submission identifier.", 400);
    const now = this.now(), month = new Date(now).toISOString().slice(0, 7);
    const intent = await this.store.transaction(state => {
      const existing = state.jobs.find(j => j.idempotencyKey === input.idempotencyKey);
      if (existing) { if (existing.quoteId !== input.quoteId || existing.redoOf !== input.redoOf) throw new StudioError("IDEMPOTENCY_CONFLICT", "This identifier belongs to another submission."); return { job: structuredClone(existing), fresh: false }; }
      const q = state.quotes.find(q => q.id === input.quoteId);
      if (!q || q.expiresAt <= now || q.usedBy) throw new StudioError("QUOTE_EXPIRED", "Get a fresh estimate before generating.");
      const profile = this.model(q.model, q.payload);
      if (q.fingerprint !== fingerprint(`${q.model}:${profile.endpoint}`, q.payload)) throw new StudioError("MODEL_PROFILE_CHANGED", "The model endpoint changed after this estimate. Get a fresh estimate.");
      if (state.jobs.some(j => j.fingerprint === q.fingerprint && active(j.status))) throw new StudioError("REQUEST_UNRESOLVED", "This exact request is already active or uncertain. Resolve it before submitting again.");
      if (q.usd > 1 && !input.confirmOverDollar) throw new StudioError("CONFIRM_PRICE", "Confirm this estimate over $1 before generating.");
      if (input.redoOf && !state.jobs.some(j => j.id === input.redoOf && terminalFailure(j.status))) throw new StudioError("REDO_BLOCKED", "Redo is available only after terminal failure. Check unresolved requests first.");
      if (state.jobs.filter(j => active(j.status)).length >= 3) throw new StudioError("QUEUE_FULL", "Three jobs are already active. Wait for a job to finish.");
      // Estimates are retained conservatively even on failure; only provider billing reconciliation can release them.
      const reserved = state.jobs.filter(j => j.month === month).reduce((sum, j) => sum + j.usd, 0);
      if (reserved + q.usd >= this.budgetUsd && !input.confirmBudget) throw new StudioError("CONFIRM_BUDGET", "This request reaches your monthly estimated budget. Explicit confirmation is required.");
      const job: StudioJob = { id: randomUUID(), idempotencyKey: input.idempotencyKey, quoteId: q.id, fingerprint: q.fingerprint, model: q.model, payload: structuredClone(q.payload), usd: q.usd, month, status: "submitting", createdAt: now, updatedAt: now, ...(input.redoOf ? { redoOf: input.redoOf } : {}) };
      q.usedBy = job.id; state.jobs.push(job);
      return { job: structuredClone(job), fresh: true };
    });
    if (!intent.fresh) return intent.job;
    // A persisted 'submitting' intent is never replayed after a crash, even if no response was saved.
    const job = intent.job;
    try {
      const result = await this.provider.submit(job.model, job.payload, job.idempotencyKey);
      if (typeof result.request_id !== "string" || !result.request_id.trim()) throw new Error("Missing request ID");
      safeStatusUrl(result.status_url);
      return await this.patch(job.id, { requestId: result.request_id, statusUrl: result.status_url, status: "queued", nextPollAt: this.now() + 2000, pollDelayMs: 2000 });
    } catch {
      return this.patch(job.id, { status: "uncertain", error: "Submission was not confirmed. Check Higgsfield before creating another request; the reservation remains held." });
    }
  }
  private async patch(id: string, patch: Partial<StudioJob>) { return this.store.transaction(state => { const job = state.jobs.find(j => j.id === id); if (!job) throw new StudioError("NOT_FOUND", "Job not found.", 404); Object.assign(job, patch, { updatedAt: this.now() }); return structuredClone(job); }); }
  /** Scheduler calls this with saved IDs. It only polls; it never submits or retries a paid POST. */
  async poll(id: string) {
    this.ready();
    const claim = await this.store.transaction(state => {
      const job = state.jobs.find(j => j.id === id);
      if (!job) throw new StudioError("NOT_FOUND", "Job not found.", 404);
      if (!job.statusUrl || !active(job.status) || (job.nextPollAt ?? 0) > this.now()) return { job: structuredClone(job), claimed: false };
      const delay = Math.min(8000, Math.max(2000, Math.round((job.pollDelayMs ?? 2000) * 1.5)));
      // Lease is longer than the transport timeout; the worker must not overlap output persistence.
      job.nextPollAt = this.now() + 120_000; job.pollDelayMs = delay;
      return { job: structuredClone(job), claimed: true };
    });
    const job = claim.job;
    if (!claim.claimed || !job.statusUrl) return job;
    let result: { status: string; outputs?: unknown };
    try { result = await this.provider.poll(safeStatusUrl(job.statusUrl)); }
    catch { return this.patch(id, { nextPollAt: this.now() + (job.pollDelayMs ?? 8000), error: "Status check failed. The saved request remains resumable; no generation was submitted." }); }
    if (result.status === "completed") {
      await this.patch(id, { status: "persisting" });
      try { const outputs = await this.store.saveOutputs(id, result.outputs, job.payload); if (!outputs.length) throw new Error("No output"); return await this.patch(id, { status: "completed", outputs, error: undefined }); }
      catch (e) { return this.patch(id, { status: "persisting", nextPollAt: this.now() + (job.pollDelayMs ?? 8000), error: e instanceof StudioError ? e.message : "Provider finished, but output storage failed. The saved request can be polled again; no new generation was submitted." }); }
    }
    if (["queued", "in_progress", "failed", "nsfw", "canceled"].includes(result.status)) return this.patch(id, { status: result.status as JobStatus, nextPollAt: this.now() + (job.pollDelayMs ?? 8000) });
    throw new StudioError("UNKNOWN_PROVIDER_STATE", "Provider returned an unknown state. The reservation remains held.", 502);
  }
  async list() { return (await this.store.read()).jobs.sort((a,b) => b.createdAt - a.createdAt).slice(0, 60); }
  async budget() { const month = new Date(this.now()).toISOString().slice(0,7); const reservedUsd = (await this.store.read()).jobs.filter(j => j.month === month).reduce((s,j) => s+j.usd,0); return { monthlyUsd: this.budgetUsd, reservedUsd, warning: reservedUsd >= this.budgetUsd * .8, accounting: "estimates and reservations, not actual charges" }; }
}
