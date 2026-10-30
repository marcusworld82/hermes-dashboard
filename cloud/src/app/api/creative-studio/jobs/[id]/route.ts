import { connection } from "next/server";
import { studioResources, studioJSON, studioFailure, publicStudioJob } from "@/lib/server/creative-studio-runtime";
export const maxDuration = 120;
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {try {const {id}=await context.params,{engine}=studioResources(false),job=await engine.poll(id);return studioJSON({job:publicStudioJob(job),statusUrl:`/api/creative-studio/jobs/${job.id}`,pollAfterMs:job.pollDelayMs??2000});}catch(e){
  await connection();return studioFailure(e);}}
