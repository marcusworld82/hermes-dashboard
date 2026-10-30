import { connection } from "next/server";
import { StudioError } from "@/lib/server/creative-studio-core";
import { studioResources, studioStorage, studioPollingAvailable, studioJSON, studioFailure, publicStudioJob } from "@/lib/server/creative-studio-runtime";
export const maxDuration = 120;
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  await connection();
  try {
    const {id}=await context.params,pollingAvailable=studioPollingAvailable();
    const job=pollingAvailable?await studioResources(false).engine.poll(id):(await studioStorage().read()).jobs.find(j=>j.id===id);
    if(!job)throw new StudioError("NOT_FOUND","Job not found.",404);
    return studioJSON({job:publicStudioJob(job),statusUrl:`/api/creative-studio/jobs/${job.id}`,pollAfterMs:job.pollDelayMs??2000,pollingAvailable,...(!pollingAvailable?{resumed:false,message:"Saved status only. Provider polling is unavailable until its credentials and budget are configured."}:{})});
  }catch(e){return studioFailure(e);}
}
