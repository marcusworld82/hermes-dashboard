import { connection } from "next/server";
import { StudioError } from "@/lib/server/creative-studio-core";
import { studioResources, studioJSON, studioFailure, publicStudioJob, sameOrigin, studioBody } from "@/lib/server/creative-studio-runtime";
export const maxDuration = 120;
export async function GET() {
  await connection();
  try {const {engine}=studioResources(false);const jobs=await engine.list();for(const j of jobs.filter(j=>["queued","in_progress","persisting"].includes(j.status)).slice(0,3))await engine.poll(j.id);return studioJSON({jobs:(await engine.list()).map(publicStudioJob),budget:await engine.budget(),storageAvailable:true});}
  catch(e){return studioFailure(e);}
}
export async function POST(request:Request) {
  try {sameOrigin(request);const b=await studioBody(request);if(typeof b.quoteId!=="string"||typeof b.idempotencyKey!=="string"||(b.redoOf!==undefined&&typeof b.redoOf!=="string"))throw new StudioError("INVALID_INPUT","Use a saved quote and stable submission identifier.",400);
    const {engine}=studioResources(),job=await engine.submit({quoteId:b.quoteId,idempotencyKey:b.idempotencyKey,confirmOverDollar:b.confirmOverDollar===true,confirmBudget:b.confirmBudget===true,redoOf:typeof b.redoOf==="string"?b.redoOf:undefined});
    return studioJSON({job:publicStudioJob(job),statusUrl:`/api/creative-studio/jobs/${job.id}`,pollAfterMs:2000},202);
  }catch(e){return studioFailure(e);}
}
