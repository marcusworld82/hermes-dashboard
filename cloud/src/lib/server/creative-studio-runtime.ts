import { CreativeStudio, StudioError, type StudioJob } from "./creative-studio-core.ts";
import { STUDIO_MODELS, publicStudioModels } from "./creative-studio-models.ts";
import { HiggsfieldStudioProvider } from "./creative-studio-provider.ts";
import { BlobStudioStore } from "./creative-studio-store.ts";
/** Owner deployment setup (no secrets belong in browser config or source):
 * STUDIO_SPEND_ENABLED=true explicitly enables paid job creation. Default false.
 * STUDIO_STORAGE_ENABLED=true only AFTER existing private Blob quota is restored.
 * BLOB_READ_WRITE_TOKEN or Vercel OIDC + BLOB_STORE_ID uses the SAME private store.
 * HF_API_KEY_ID / HF_API_KEY_SECRET: owner-managed Higgsfield production API keys.
 * STUDIO_MONTHLY_BUDGET_USD: positive USD estimate/reservation limit (not an invoice).
 * STUDIO_OUTPUT_HOSTS: comma-separated exact trusted provider CDN hostnames. Signed
 * output URLs are never given to browsers; media is persisted privately first.
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
  return { monthlyUsd, spending: process.env.STUDIO_SPEND_ENABLED === "true", storage: process.env.STUDIO_STORAGE_ENABLED === "true", provider: !!process.env.HF_API_KEY_ID?.trim() && !!process.env.HF_API_KEY_SECRET?.trim(), storageCredentials: !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN), outputHosts: (process.env.STUDIO_OUTPUT_HOSTS || "images.higgs.ai,d28lhcrx5qdowv.cloudfront.net").split(",").map(s=>s.trim()).filter(s=>/^[a-z0-9.-]+$/.test(s) && !/^[0-9.]+$/.test(s)) };
};
export function creativeStudioStatus() {
  const c=config(), blockers: {code:string;message:string}[]=[];
  if (!c.spending) blockers.push({code:"SPENDING_DISABLED",message:"Paid Studio submissions are disabled. The owner can set STUDIO_SPEND_ENABLED=true after completing setup."});
  if (!c.storage || !c.storageCredentials) blockers.push({code:"STORAGE_UNAVAILABLE",message:"Restore the existing private Blob quota, then configure STUDIO_STORAGE_ENABLED=true with its server-side credentials. Studio does not bypass storage limits."});
  if (!Number.isFinite(c.monthlyUsd) || c.monthlyUsd<=0) blockers.push({code:"BUDGET_REQUIRED",message:"Configure a positive STUDIO_MONTHLY_BUDGET_USD before paid submissions."});
  if (!c.provider) blockers.push({code:"PROVIDER_NOT_CONNECTED",message:"Connect HF_API_KEY_ID and HF_API_KEY_SECRET in the owner deployment environment."});
  return { enabled:blockers.length===0, provider:"higgsfield", publishingConnected:false, maxConcurrentJobs:3, quoteTtlSeconds:600, pollIntervalMs:{min:2000,max:8000}, models:publicStudioModels(), blockers, budget:{monthlyUsd:Number.isFinite(c.monthlyUsd)&&c.monthlyUsd>0?c.monthlyUsd:null,reservedUsd:null as number|null,warning:false,accounting:"unavailable"}, storageHealth:"not_checked" };
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
export async function liveStudioStatus() {
  const status=creativeStudioStatus();
  // No network checks while owner has storage explicitly disabled/quota suspended.
  if(status.blockers.some(b=>b.code!=="SPENDING_DISABLED"))return status;
  try { const {engine}=studioResources(false), b=await engine.budget();return {...status,budget:b,storageHealth:"readable"}; }
  catch { return {...status,enabled:false,storageHealth:"unavailable",blockers:[...status.blockers,{code:"STORAGE_UNAVAILABLE",message:"Private storage health check failed. Storage may be quota-suspended; no generation can start without a durable reservation."}]}; }
}
export function publicStudioJob(j:StudioJob) {
  return {id:j.id,model:j.model,status:j.status,usd:j.usd,createdAt:j.createdAt,updatedAt:j.updatedAt,redoOf:j.redoOf,error:j.status==="submitting"?"Submission is awaiting confirmation. If interrupted, check Higgsfield; this intent will not be replayed.":j.error,outputs:j.outputs?.map((o,i)=>({downloadUrl:`/api/creative-studio/jobs/${j.id}/outputs/${i}`,contentType:o.contentType,bytes:o.bytes,width:o.width,height:o.height}))};
}
export const studioJSON = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export function studioFailure(e:unknown) { const known=e instanceof StudioError;return studioJSON({error:{code:known?e.code:"STUDIO_ERROR",message:known?e.message:"Studio could not complete this operation. Check the saved job before resubmitting."}},known?e.status:503); }
export function sameOrigin(request:Request) { const origin=request.headers.get("origin");if(!origin || origin!==new URL(request.url).origin)throw new StudioError("ORIGIN_REQUIRED","Studio changes require a same-origin owner request.",403); }
export async function studioBody(request:Request) { if(Number(request.headers.get("content-length")??0)>32000)throw new StudioError("BODY_TOO_LARGE","Studio request is too large.",413);const text=await request.text();if(text.length>32000)throw new StudioError("BODY_TOO_LARGE","Studio request is too large.",413);try {const body=JSON.parse(text);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new StudioError("INVALID_JSON","Use a JSON object for this request.",400);} }
