import {supabaseStorageConfigured} from './hermes-storage.mjs';
import {PUBLIC_PAID_GENERATION_ENABLED} from "./link-public.mjs";
import { CreativeStudio, StudioError, type StudioJob, type StudioStore } from "./creative-studio-core.ts";
import { STUDIO_MODELS, publicStudioModels } from "./creative-studio-models.ts";
import { HiggsfieldStudioProvider } from "./creative-studio-provider.ts";
import { sourceDeliveryReady } from "./creative-studio-source.ts";
import { BlobStudioStore } from "./creative-studio-store.ts";
/** Owner deployment setup (no secrets belong in browser config or source):
 * STUDIO_SPEND_ENABLED=true explicitly enables paid job creation. Default false.
 * STUDIO_STORAGE_ENABLED=true only AFTER existing private Blob quota is restored.
 * BLOB_READ_WRITE_TOKEN or Vercel OIDC + BLOB_STORE_ID uses the SAME private store.
 * HF_API_KEY_ID / HF_API_KEY_SECRET: owner-managed Higgsfield production API keys.
 * STUDIO_MONTHLY_BUDGET_USD: positive USD estimate/reservation limit (not an invoice).
 * STUDIO_OUTPUT_HOSTS: comma-separated exact trusted provider CDN hostnames. Signed
 * output URLs are never given to browsers; media is persisted privately first.
 * STUDIO_SOURCE_ENABLED=true plus STUDIO_SOURCE_SIGNING_SECRET (>=32 chars)
 * explicitly enables HMAC source delivery for I2V. Both are disabled/unset by default.
 * STUDIO_PUBLIC_BASE_URL defaults to the canonical existing Hermes deployment.
 * Any other host must appear in owner-managed STUDIO_SOURCE_ALLOWED_HOSTS. Source
 * tokens expire within fifteen minutes; only normalized saved PNGs can be served.
 * Defaults cover the official console media hosts; add actual generation CDN hosts
 * only after checking them. No credentials accompany CDN downloads; no redirects.
 *
 * GET jobs/[id] resumes a known request once; GET jobs resumes up to three.
 * POST resume is an authenticated worker entry point for a deployment scheduler.
 * Closing the browser does not lose job metadata; revisit to resume polling. This
 * endpoint never replays paid POSTs. No schedule or external account is installed.
 * Official schemas are dated in creative-studio-models.ts. PDF aliases aren't models.
 * Publishing intentionally has no implementation or connection in this API.
 */
const config = () => {
  const monthlyUsd = Number(process.env.STUDIO_MONTHLY_BUDGET_USD ?? "");
  return { monthlyUsd, spending: PUBLIC_PAID_GENERATION_ENABLED && process.env.STUDIO_SPEND_ENABLED === "true", storage: process.env.STUDIO_STORAGE_ENABLED === "true", provider: !!process.env.HF_API_KEY_ID?.trim() && !!process.env.HF_API_KEY_SECRET?.trim(), storageCredentials: process.env.HERMES_STORAGE_PROVIDER==='supabase'?supabaseStorageConfigured():!!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN), outputHosts: (process.env.STUDIO_OUTPUT_HOSTS || "images.higgs.ai,d28lhcrx5qdowv.cloudfront.net").split(",").map(s=>s.trim()).filter(s=>/^[a-z0-9.-]+$/.test(s) && !/^[0-9.]+$/.test(s)) };
};
export function creativeStudioStatus() {
  const c=config(), blockers: {code:string;message:string}[]=[];
  if (!c.spending) blockers.push({code:"SPENDING_DISABLED",message:"Paid Studio submissions are disabled in this public release. Provider setup and an approved spending limit are required before enabling them."});
  if (!c.storage || !c.storageCredentials) blockers.push({code:"STORAGE_UNAVAILABLE",message:"Configure the selected private storage provider and enable STUDIO_STORAGE_ENABLED. Supabase uses HERMES_SUPABASE_URL and HERMES_SUPABASE_SECRET_KEY on the server."});
  if (!Number.isFinite(c.monthlyUsd) || c.monthlyUsd<=0) blockers.push({code:"BUDGET_REQUIRED",message:"Configure a positive STUDIO_MONTHLY_BUDGET_USD before paid submissions."});
  if (!c.provider) blockers.push({code:"PROVIDER_NOT_CONNECTED",message:"Connect HF_API_KEY_ID and HF_API_KEY_SECRET in the owner deployment environment."});
  return { canEstimate:c.provider, enabled:blockers.length===0, canReadJobs:c.storage&&c.storageCredentials, provider:"higgsfield", publishingConnected:false, maxConcurrentJobs:3, quoteTtlSeconds:600, pollIntervalMs:{min:2000,max:8000}, models:publicStudioModels().map(m=>({...m,...(m.requiresSource?{sourceReady:sourceDeliveryReady(),sourceBlocker:sourceDeliveryReady()?null:"Configure owner-managed expiring source delivery before making a saved image move."}:{})})), blockers, budget:{monthlyUsd:Number.isFinite(c.monthlyUsd)&&c.monthlyUsd>0?c.monthlyUsd:null,reservedUsd:null as number|null,warning:false,accounting:"unavailable"}, storageHealth:"not_checked" };
}
export function studioStorage() {
  const c=config();
  if(!c.storage || !c.storageCredentials)throw new StudioError("STORAGE_UNAVAILABLE","Restore the existing private Blob quota and configure Studio storage before reading saved media.",503);
  return new BlobStudioStore(c.outputHosts);
}
export function studioResources(requireSpending = true) {
  const status=creativeStudioStatus(), c=config();
  const blockers=status.blockers.filter(b=>requireSpending || b.code!=="SPENDING_DISABLED");
  if(blockers.length)throw new StudioError("STUDIO_NOT_CONFIGURED",blockers.map(b=>b.message).join(" "),503);
  const store=studioStorage();
  const provider=new HiggsfieldStudioProvider(STUDIO_MODELS,()=>({id:process.env.HF_API_KEY_ID?.trim()??"",secret:process.env.HF_API_KEY_SECRET?.trim()??""}));
  return {store,engine:new CreativeStudio(store,provider,STUDIO_MODELS,c.monthlyUsd)};
}
export function studioPollingAvailable() {
  const c=config();
  return c.storage&&c.storageCredentials&&c.provider&&Number.isFinite(c.monthlyUsd)&&c.monthlyUsd>0;
}
/** Reading saved artifacts does not require provider keys, spending, or a budget. */
export async function readStudioHistory(store:Pick<StudioStore,"read">=studioStorage(), monthlyUsd=config().monthlyUsd, now=Date.now()) {
  const state=await store.read(),month=new Date(now).toISOString().slice(0,7);
  const reservedUsd=state.jobs.filter(j=>j.month===month).reduce((sum,j)=>{
    if(typeof j.usd!=="number"||!Number.isFinite(j.usd)||j.usd<0)throw new StudioError("STORAGE_UNAVAILABLE","Saved Studio accounting is invalid. Restore its metadata before generating.",503);
    return sum+j.usd;
  },0);
  const available=Number.isFinite(monthlyUsd)&&monthlyUsd>0;
  return {jobs:[...state.jobs].sort((a,b)=>b.createdAt-a.createdAt).slice(0,60),budget:{available,monthlyUsd:available?monthlyUsd:null,reservedUsd,warning:available&&reservedUsd>=monthlyUsd*.8,accounting:available?"estimates and reservations, not actual charges":"estimated reservations; monthly budget unavailable"}};
}
export async function liveStudioStatus() {
  const status=creativeStudioStatus();
  // No network checks while owner has storage explicitly disabled/quota suspended.
  if(!status.canReadJobs)return status;
  try { const history=await readStudioHistory();return {...status,budget:history.budget,storageHealth:"readable"}; }
  catch { return {...status,enabled:false,canReadJobs:false,storageHealth:"unavailable",blockers:[...status.blockers,{code:"STORAGE_UNAVAILABLE",message:"Private storage health check failed. Storage may be quota-suspended; no generation can start without a durable reservation."}]}; }
}
export function publicStudioSource(source:StudioJob["source"]) { return source?{jobId:source.jobId,outputIndex:source.outputIndex,aspectRatio:source.aspectRatio,width:source.width,height:source.height}:undefined; }
export function publicStudioJob(j:StudioJob) {
  return {id:j.id,model:j.model,status:j.status,caption:j.caption,aspectRatio:j.source?.aspectRatio??j.payload?.aspect_ratio,source:publicStudioSource(j.source),usd:j.usd,createdAt:j.createdAt,updatedAt:j.updatedAt,redoOf:j.redoOf,error:j.status==="submitting"?"Submission is awaiting confirmation. If interrupted, check Higgsfield; this intent will not be replayed.":j.error,outputs:j.outputs?.map((o,i)=>({downloadUrl:`/api/creative-studio/jobs/${j.id}/outputs/${i}`,contentType:o.contentType,bytes:o.bytes,width:o.width,height:o.height,...(o.contentType==="image/png"&&o.width===1080&&o.height?{sourceReference:{jobId:j.id,outputIndex:i}}:{})}))};
}
export const studioJSON = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export function studioFailure(e:unknown) { const known=e instanceof StudioError;return studioJSON({error:{code:known?e.code:"STUDIO_ERROR",message:known?e.message:"Studio could not complete this operation. Check the saved job before resubmitting."}},known?e.status:503); }
export function sameOrigin(request:Request) { const origin=request.headers.get("origin");if(!origin || origin!==new URL(request.url).origin)throw new StudioError("ORIGIN_REQUIRED","Studio changes require a same-origin owner request.",403); }
export async function studioBody(request:Request) { if(Number(request.headers.get("content-length")??0)>32000)throw new StudioError("BODY_TOO_LARGE","Studio request is too large.",413);const text=await request.text();if(text.length>32000)throw new StudioError("BODY_TOO_LARGE","Studio request is too large.",413);try {const body=JSON.parse(text);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new StudioError("INVALID_JSON","Use a JSON object for this request.",400);} }
