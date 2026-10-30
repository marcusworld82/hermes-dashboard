import {privateStorage} from './private-storage.ts';
import { createHash } from "node:crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { StudioError, type StudioState, type StudioStore, type SavedOutput, type Payload } from "./creative-studio-core.ts";
import { normalizeStudioImage } from "./creative-studio-images.ts";
const STATE_KEY = "hermes/creative-studio/v1/state.json";
const MAX_BYTES = 100 * 1024 * 1024;
/** Official SDK CAS + uncached origin reads. No cache or ephemeral filesystem is authoritative.
 * https://vercel.com/docs/vercel-blob/using-blob-sdk#put
 * @vercel/blob >=2.8.2 is required for ETag preconditions. */
export class BlobStudioStore implements StudioStore {
  durable = true;
  private fetcher: typeof fetch;
  private outputHosts: string[];
  private blob: { get: typeof get; put: typeof put };
  constructor(outputHosts: string[], fetcher: typeof fetch = fetch, blob = privateStorage()) { this.outputHosts = outputHosts; this.fetcher = fetcher; this.blob = blob; }
  private async load() {
    try {
      const blob = await this.blob.get(STATE_KEY,{access:"private",useCache:false});
      if (!blob) return { state: { jobs:[], quotes:[] } as StudioState, etag: undefined };
      if (blob.statusCode !== 200 || !blob.stream) throw new Error("Missing state content");
      const state = await new Response(blob.stream).json() as StudioState;
      if (!Array.isArray(state.jobs) || !Array.isArray(state.quotes)) throw new Error("Invalid state");
      return {state,etag:blob.blob.etag};
    } catch { throw new StudioError("STORAGE_UNAVAILABLE", "Private Studio storage is unavailable, quota-suspended, or invalid. Restore it before generating; no quota bypass is attempted.",503); }
  }
  async read() { return structuredClone((await this.load()).state); }
  async transaction<T>(mutate: (state: StudioState) => T): Promise<T> {
    for (let attempt=0;attempt<5;attempt++) {
      const { state, etag } = await this.load();
      const before = JSON.stringify(state);
      const result = mutate(state); // Throws before any write; callback must be synchronous and side-effect free.
      const serialized = JSON.stringify(state);
      if (serialized === before) return structuredClone(result); // Read-only polling must not spend a Blob write.
      try {
        await this.blob.put(STATE_KEY,serialized,{access:"private",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:"application/json",cacheControlMaxAge:60});
        return structuredClone(result);
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError || (e instanceof Error && e.name === "BlobPreconditionFailedError") || (!etag && e instanceof Error && /already exists/i.test(e.message))) continue;
        throw new StudioError("STORAGE_UNAVAILABLE","Studio could not durably save its reservation. No new generation may be submitted. Restore private storage capacity.",503);
      }
    }
    throw new StudioError("STORAGE_BUSY","Studio reservations changed concurrently. Retry the same submission identifier.",503);
  }
  async saveOutputs(jobId: string, outputs: unknown, payload: Payload): Promise<SavedOutput[]> {
    if (!/^[a-zA-Z0-9_-]+$/.test(jobId) || !Array.isArray(outputs) || !outputs.length || outputs.length>8) throw new Error("Invalid outputs");
    const saved: SavedOutput[]=[];
    for (const output of outputs) {
      const url = new URL(String(output?.url ?? ""));
      if (url.protocol!=="https:" || url.username || url.password || url.port || !this.outputHosts.includes(url.hostname)) throw new StudioError("OUTPUT_HOST_UNAPPROVED","Approve the exact provider output CDN hostname in STUDIO_OUTPUT_HOSTS before downloading. No API credentials were sent to it.",503);
      // Signed CDN URLs are server-only. No provider Authorization header accompanies media requests.
      const response = await this.fetcher(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(60_000)});
      let type = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!response.ok || !response.body || !["image/png","image/jpeg","image/webp","video/mp4","video/quicktime"].includes(type)) throw new Error("Unsupported provider output");
      const reader=response.body.getReader(), chunks: Uint8Array[]=[]; let bytes=0;
      try { for (;;) { const part=await reader.read(); if(part.done)break; bytes+=part.value.byteLength;if(bytes>MAX_BYTES)throw new Error("Output exceeds Studio 100 MiB limit");chunks.push(part.value); } } finally { await reader.cancel(); }
      if (!bytes) throw new Error("Empty provider output");
      let body=Buffer.concat(chunks);
      let dimensions: {width:number;height:number}|undefined;
      if(type.startsWith("image/")) {
        const normalized=await normalizeStudioImage(body,payload);
        body=normalized.body; type=normalized.contentType;
        dimensions={width:normalized.width,height:normalized.height};
        bytes=body.byteLength;
      }
      const digest=createHash("sha256").update(body).digest("hex");
      const key=`hermes/creative-studio/v1/outputs/${jobId}/${digest}`;
      // Same content may be saved again after a crash; immutable content-addressed keys prevent corruption.
      const existing=await this.blob.get(key,{access:"private",useCache:false});
      if (!existing) await this.blob.put(key,body,{access:"private",addRandomSuffix:false,allowOverwrite:false,contentType:type,cacheControlMaxAge:60});
      else { if(existing.stream)await existing.stream.cancel(); if(existing.blob.size!==bytes)throw new Error("Stored output mismatch"); }
      saved.push({key,contentType:type,bytes,...dimensions});
    }
    return saved;
  }
  async output(key: string) { if(!key.startsWith("hermes/creative-studio/v1/outputs/"))throw new Error("Invalid key");return this.blob.get(key,{access:"private",useCache:false}); }
}
