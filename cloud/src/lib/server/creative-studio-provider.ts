import { safeStatusUrl, StudioError, type Payload, type StudioModel, type StudioProvider } from "./creative-studio-core.ts";
const API = "https://api.higgsfield.ai";
/** Transport only. Owner must install verified profiles and durable storage before using this. */
export class HiggsfieldStudioProvider implements StudioProvider {
  private models: StudioModel[]; private credentials: () => { id: string; secret: string }; private fetcher: typeof fetch;
  constructor(models: StudioModel[], credentials: () => { id: string; secret: string }, fetcher: typeof fetch = fetch) { this.models = models; this.credentials = credentials; this.fetcher = fetcher; }
  private headers() { const { id, secret } = this.credentials(); if (!id || !secret) throw new StudioError("PROVIDER_NOT_CONNECTED", "Connect Higgsfield in the owner deployment.", 503); return { Authorization: `Key ${id}:${secret}`, "User-Agent": "Hermes-Creative-Studio/1.0", "Content-Type": "application/json", Accept: "application/json" }; }
  private endpoint(model: string) { const m = this.models.find(m => m.id === model); if (!m || !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(m.endpoint) || m.endpoint.includes("..") || m.endpoint.includes("//")) throw new StudioError("MODEL_PROFILE_REQUIRED", "A verified production model profile is required.", 503); return m.endpoint; }
  private async json(url: string, init: RequestInit) { const response = await this.fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new StudioError("PROVIDER_ERROR", `Higgsfield returned HTTP ${response.status}. No automatic submission retry was made.`, 502); return response.json(); }
  async estimate(model: string, payload: Payload) { return this.json(`${API}/estimate/${this.endpoint(model)}`, { method: "POST", headers: this.headers(), body: JSON.stringify(payload) }); }
  async submit(model: string, payload: Payload, key: string) { return this.json(`${API}/${this.endpoint(model)}`, { method: "POST", headers: { ...this.headers(), "Idempotency-Key": key }, body: JSON.stringify(payload) }); }
  async poll(statusUrl: string) {
    const result = await this.json(safeStatusUrl(statusUrl), { headers: this.headers() });
    // Official shared lifecycle documents images[] and video.url outputs.
    const outputs = Array.isArray(result.images) ? result.images : result.video?.url ? [result.video] : [];
    return { status: String(result.status ?? ""), outputs };
  }
}
