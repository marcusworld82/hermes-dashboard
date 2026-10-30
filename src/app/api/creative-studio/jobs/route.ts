import { connection } from "next/server";
import { StudioError } from "@/lib/server/creative-studio-core";
import { studioResources, studioJSON, studioFailure, publicStudioJob, sameOrigin, studioBody, readStudioHistory, studioPollingAvailable } from "@/lib/server/creative-studio-runtime";
export const maxDuration = 120;
export async function GET() {
  await connection();
  try {
    let history=await readStudioHistory();
    const pollingAvailable=studioPollingAvailable();
    if(pollingAvailable) {
      const {engine}=studioResources(false);
      for(const j of history.jobs.filter(j=>["queued","in_progress","persisting"].includes(j.status)).slice(0,3))await engine.poll(j.id);
      history=await readStudioHistory();
    }
    return studioJSON({jobs:history.jobs.map(publicStudioJob),budget:history.budget,storageAvailable:true,pollingAvailable});
  }
  catch(e){return studioFailure(e);}
}
export async function POST(request:Request) {
  try {sameOrigin(request);const b=await studioBody(request);if(typeof b.quoteId!=="string"||typeof b.idempotencyKey!=="string"||(b.redoOf!==undefined&&typeof b.redoOf!=="string"))throw new StudioError("INVALID_INPUT","Use a saved quote and stable submission identifier.",400);
    const {engine}=studioResources(),job=await engine.submit({quoteId:b.quoteId,idempotencyKey:b.idempotencyKey,confirmOverDollar:b.confirmOverDollar===true,confirmBudget:b.confirmBudget===true,redoOf:typeof b.redoOf==="string"?b.redoOf:undefined});
    return studioJSON({job:publicStudioJob(job),statusUrl:`/api/creative-studio/jobs/${job.id}`,pollAfterMs:2000},202);
  }catch(e){return studioFailure(e);}
}
