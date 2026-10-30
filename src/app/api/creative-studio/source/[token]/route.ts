import { connection } from "next/server";
import { StudioError } from "@/lib/server/creative-studio-core";
import { studioStorage, studioFailure } from "@/lib/server/creative-studio-runtime";
import { sourceDeliveryConfig, verifyStudioSourceToken, savedStudioSource, readNormalizedSource } from "@/lib/server/creative-studio-source";
/** Exact GET/HEAD path is exempt from owner-cookie auth. HMAC+expiry replaces that
 * auth ONLY for this byte-delivery endpoint; all other Studio routes stay private. */
async function deliver(request:Request,context:{params:Promise<{token:string}>}) {
  await connection();
  try {
    const {token}=await context.params,claims=verifyStudioSourceToken(token,sourceDeliveryConfig());
    // Signature, claims, expiry, and deployment configuration are checked before any storage read.
    const store=studioStorage(),source=savedStudioSource(await store.read(),claims.jobId,claims.outputIndex);
    if(source.sha256!==claims.sha256)throw new StudioError("SOURCE_ACCESS_DENIED","Image source link no longer matches the saved artifact.",403);
    const bytes=await readNormalizedSource(store,source);
    return new Response(request.method==="HEAD"?null:new Uint8Array(bytes),{headers:{"Content-Type":"image/png","Content-Length":String(bytes.byteLength),"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Disposition":"inline; filename=studio-source.png"}});
  }catch(e){const response=studioFailure(e);response.headers.set("Referrer-Policy","no-referrer");response.headers.set("X-Content-Type-Options","nosniff");return response;}
}
export const GET=deliver;
export const HEAD=deliver;
