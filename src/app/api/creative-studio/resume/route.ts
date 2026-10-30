import { studioResources, studioJSON, studioFailure, sameOrigin, publicStudioJob } from "@/lib/server/creative-studio-runtime";
export const maxDuration = 120;
/** Authenticated owner worker tick; never submits paid POSTs. Existing app auth gates this. */
export async function POST(request:Request) {try {sameOrigin(request);const {engine}=studioResources(false),jobs=await engine.list();const resumed=[];for(const j of jobs.filter(j=>["queued","in_progress","persisting"].includes(j.status)).slice(0,3))resumed.push(publicStudioJob(await engine.poll(j.id)));return studioJSON({jobs:resumed,pollAfterMs:8000});}catch(e){return studioFailure(e);}}
