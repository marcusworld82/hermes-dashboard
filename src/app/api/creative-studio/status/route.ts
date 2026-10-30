import {sourceDeliveryConfig,requireSourceDeployment} from "@/lib/server/creative-studio-source";
import { connection } from "next/server";
import { liveStudioStatus, studioJSON } from "@/lib/server/creative-studio-runtime";
export async function GET(request:Request) {
  await connection();const status=await liveStudioStatus();
  for(const model of status.models)if(model.requiresSource&&model.sourceReady){try{requireSourceDeployment(request.url,sourceDeliveryConfig());}catch{model.sourceReady=false;model.sourceBlocker="This preview needs its own owner-approved HTTPS source base before image sharing can run.";}}
  return studioJSON(status); }
