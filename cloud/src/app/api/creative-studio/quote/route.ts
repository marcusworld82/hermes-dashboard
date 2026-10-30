import { StudioError } from "@/lib/server/creative-studio-core";
import { studioResources, studioJSON, studioFailure, sameOrigin, studioBody } from "@/lib/server/creative-studio-runtime";
export async function POST(request:Request) {
  try { sameOrigin(request);const body=await studioBody(request);if(typeof body.model!=="string"||!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))throw new StudioError("INVALID_INPUT","Choose a verified model and its request settings.",400);
    const {engine}=studioResources(),q=await engine.quote(body.model,body.payload as Record<string,unknown>),budget=await engine.budget();
    return studioJSON({quote:{id:q.id,model:q.model,usd:q.usd,expiresAt:q.expiresAt,fingerprint:q.fingerprint},budget,requiresPriceConfirmation:q.usd>1,requiresBudgetConfirmation:budget.reservedUsd+q.usd>=budget.monthlyUsd,warning:budget.reservedUsd+q.usd>=budget.monthlyUsd*.8});
  }catch(e){return studioFailure(e);}
}
