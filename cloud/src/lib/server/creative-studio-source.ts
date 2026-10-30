import sharp from "sharp";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { StudioError, type StudioSource, type StudioState } from "./creative-studio-core.ts";
import type { BlobStudioStore } from "./creative-studio-store.ts";
const CANONICAL_HOST = "hermes-dashboard-sandy.vercel.app";
export const SOURCE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,400}\.[A-Za-z0-9_-]{43}$/;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
export type SourceDeliveryConfig = { origin: string; secret: string };
export function sourceDeliveryConfig(env: Record<string,string|undefined> = process.env): SourceDeliveryConfig {
  const secret=env.STUDIO_SOURCE_SIGNING_SECRET ?? "";
  let base: URL;
  try { base=new URL(env.STUDIO_PUBLIC_BASE_URL || `https://${CANONICAL_HOST}`); } catch { throw new StudioError("SOURCE_DELIVERY_NOT_CONFIGURED","Set the owner-approved HTTPS Studio public base URL.",503); }
  const extra=(env.STUDIO_SOURCE_ALLOWED_HOSTS ?? "").split(",").map(h=>h.trim().toLowerCase()).filter(h=>/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(h)&&!h.endsWith(".local")&&!h.endsWith(".internal")&&!h.endsWith(".localhost"));
  if(env.STUDIO_SOURCE_ENABLED!=="true" || secret.length<32 || base.protocol!=="https:" || base.username || base.password || base.port || base.pathname!=="/" || base.search || base.hash || ![CANONICAL_HOST,...extra].includes(base.hostname)) throw new StudioError("SOURCE_DELIVERY_NOT_CONFIGURED","Image-to-video requires STUDIO_SOURCE_ENABLED=true, an owner-managed STUDIO_SOURCE_SIGNING_SECRET of at least 32 characters and an approved STUDIO_PUBLIC_BASE_URL. Other Studio models remain available.",503);
  return {origin:base.origin,secret};
}
export function requireSourceDeployment(requestUrl:string,config:SourceDeliveryConfig) {
  if(new URL(requestUrl).origin!==config.origin)throw new StudioError("SOURCE_DEPLOYMENT_MISMATCH","Open the owner-approved Studio app URL, or explicitly configure this preview's HTTPS source base and allowed host before sharing an image. No paid request was submitted.",409);
}
export function sourceDeliveryReady() { try {sourceDeliveryConfig();return true;}catch{return false;} }
export function savedStudioSource(state: StudioState, jobId: unknown, outputIndex: unknown): StudioSource {
  if(typeof jobId!=="string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId) || typeof outputIndex!=="number" || !Number.isInteger(outputIndex) || outputIndex<0 || outputIndex>7)throw new StudioError("INVALID_SOURCE","Choose a saved Studio image output.",400);
  const job=state.jobs.find(j=>j.id===jobId),output=job?.outputs?.[outputIndex];
  const digest=output?.key.match(new RegExp(`^hermes/creative-studio/v1/outputs/${jobId}/([a-f0-9]{64})$`))?.[1];
  if(!job || job.status!=="completed" || !output || output.contentType!=="image/png" || output.width!==1080 || !output.height || !digest)throw new StudioError("SOURCE_NOT_READY","Choose a completed, normalized private Studio PNG image. Other URLs and uploads cannot be used here.",409);
  return {jobId,outputIndex,sha256:digest,aspectRatio:typeof job.payload.aspect_ratio==="string"?job.payload.aspect_ratio:"1:1",width:output.width,height:output.height,expiresAt:0};
}
export function signedStudioSource(source: StudioSource, config: SourceDeliveryConfig, now=Date.now()) {
  // Stable within a five-minute bucket, with at most fifteen minutes of public read access.
  const expiresAt=(Math.floor(now/300_000)*300_000)+900_000;
  const claims={j:source.jobId,i:source.outputIndex,h:source.sha256,e:Math.floor(expiresAt/1000)};
  const body=Buffer.from(JSON.stringify(claims)).toString("base64url"),signature=createHmac("sha256",config.secret).update(body).digest("base64url");
  return {source:{...source,expiresAt},url:`${config.origin}/api/creative-studio/source/${body}.${signature}`};
}
export function verifyStudioSourceToken(token: string, config: SourceDeliveryConfig, now=Date.now()) {
  if(!SOURCE_TOKEN_PATTERN.test(token))throw new StudioError("SOURCE_ACCESS_DENIED","Image source link is invalid or expired.",403);
  const [body,signature]=token.split("."),expected=createHmac("sha256",config.secret).update(body).digest(),provided=Buffer.from(signature,"base64url");
  if(expected.length!==provided.length || !timingSafeEqual(expected,provided))throw new StudioError("SOURCE_ACCESS_DENIED","Image source link is invalid or expired.",403);
  let c: Record<string,unknown>;
  try {c=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));}catch{throw new StudioError("SOURCE_ACCESS_DENIED","Image source link is invalid or expired.",403);}
  if(!c || typeof c!=="object" || Array.isArray(c) || typeof c.j!=="string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(c.j) || typeof c.i!=="number" || !Number.isInteger(c.i) || c.i<0 || c.i>7 || typeof c.h!=="string" || !/^[a-f0-9]{64}$/.test(c.h) || typeof c.e!=="number" || !Number.isInteger(c.e) || c.e*1000<=now || c.e*1000>now+900_000)throw new StudioError("SOURCE_ACCESS_DENIED","Image source link is invalid or expired.",403);
  return {jobId:c.j,outputIndex:c.i,sha256:c.h,expiresAt:c.e*1000};
}
export async function readNormalizedSource(store: Pick<BlobStudioStore,"output">, source: StudioSource) {
  const key=`hermes/creative-studio/v1/outputs/${source.jobId}/${source.sha256}`,blob=await store.output(key);
  if(!blob || blob.statusCode!==200 || !blob.stream || blob.blob.size>MAX_SOURCE_BYTES || blob.blob.contentType!=="image/png")throw new StudioError("SOURCE_NOT_READY","The saved normalized image is unavailable in private storage.",503);
  const reader=blob.stream.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try {for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_SOURCE_BYTES)throw new Error("Source too large");chunks.push(part.value);}}finally{await reader.cancel();}
  const body=Buffer.concat(chunks);
  if(createHash("sha256").update(body).digest("hex")!==source.sha256 || !body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new StudioError("SOURCE_NOT_READY","The saved image failed artifact verification.",503);
  const metadata=await sharp(body,{limitInputPixels:40_000_000,pages:1,failOn:"error"}).metadata();
  if(metadata.format!=="png" || metadata.width!==1080 || metadata.width!==source.width || metadata.height!==source.height)throw new StudioError("SOURCE_NOT_READY","The saved image dimensions do not match the normalized source artifact.",503);
  return body;
}
export async function prepareSavedImageQuote(store: Pick<BlobStudioStore,"read"|"output">, input:{source:unknown;payload:Record<string,unknown>;caption?:string;confirmSourceShare?:boolean}, config=sourceDeliveryConfig(), now=Date.now()) {
  if(input.confirmSourceShare!==true)throw new StudioError("SOURCE_SHARE_CONFIRMATION_REQUIRED","Confirm that the selected cropped image may be shared with Higgsfield before requesting its estimate.",409);
  if(Object.keys(input.payload).some(k=>!["prompt","duration","resolution","output_format","generate_audio"].includes(k)))throw new StudioError("INVALID_SOURCE_INPUT","Image-to-video accepts a saved source reference and motion settings, without image URLs or a shape override.",400);
  if(!input.source || typeof input.source!=="object" || Array.isArray(input.source))throw new StudioError("SOURCE_REQUIRED","Choose the saved cropped Studio image to share with Higgsfield.",400);
  const ref=input.source as Record<string,unknown>;
  if(Object.keys(ref).some(k=>!["jobId","outputIndex"].includes(k)))throw new StudioError("INVALID_SOURCE_INPUT","Use only a saved job and output index as the source reference.",400);
  const state=await store.read(),selected=savedStudioSource(state,ref.jobId,ref.outputIndex);
  await readNormalizedSource(store,selected);
  const signed=signedStudioSource(selected,config,now);
  return {payload:{...input.payload,image_url:signed.url},source:signed.source,caption:input.caption??state.jobs.find(j=>j.id===selected.jobId)?.caption};
}
