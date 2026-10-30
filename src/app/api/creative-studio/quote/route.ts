import { StudioError, type Payload, type StudioSource } from "@/lib/server/creative-studio-core";
import { studioResources, studioJSON, studioFailure, sameOrigin, studioBody, publicStudioSource } from "@/lib/server/creative-studio-runtime";
import { prepareSavedImageQuote,sourceDeliveryConfig,requireSourceDeployment } from "@/lib/server/creative-studio-source";
export async function POST(request:Request) {
  try {
    sameOrigin(request);
    const body=await studioBody(request);
    if(typeof body.model!=="string"||!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))throw new StudioError("INVALID_INPUT","Choose a verified model and its request settings.",400);
    if(body.caption!==undefined && (typeof body.caption!=="string" || body.caption.length>4000))throw new StudioError("INVALID_CAPTION","Caption must be at most 4,000 characters.",400);
    if(body.model==="seedance-2.5-i2v" && body.confirmSourceShare!==true)throw new StudioError("SOURCE_SHARE_CONFIRMATION_REQUIRED","Confirm that the selected cropped image may be shared with Higgsfield before requesting its estimate.",409);
    const {engine,store}=studioResources();
    let payload=body.payload as Payload,source:StudioSource|undefined,caption=typeof body.caption==="string"?body.caption:undefined;
    if(body.model==="seedance-2.5-i2v") {
      // Never hand a preview image to a different deployment without the source route.
      const delivery=sourceDeliveryConfig();requireSourceDeployment(request.url,delivery);
      // The resolver accepts only a saved output reference, never client URLs.
      const prepared=await prepareSavedImageQuote(store,{source:body.source,payload,caption,confirmSourceShare:body.confirmSourceShare===true},delivery);
      source=prepared.source;payload=prepared.payload;caption=prepared.caption;
    } else if(body.source!==undefined)throw new StudioError("INVALID_SOURCE_INPUT","This model does not accept a saved source image.",400);
    const q=await engine.quote(body.model,payload,{source,caption}),budget=await engine.budget();
    return studioJSON({quote:{id:q.id,model:q.model,usd:q.usd,expiresAt:q.expiresAt,fingerprint:q.fingerprint,source:publicStudioSource(q.source),caption:q.caption},budget,requiresPriceConfirmation:q.usd>1,requiresBudgetConfirmation:budget.reservedUsd+q.usd>=budget.monthlyUsd,warning:budget.reservedUsd+q.usd>=budget.monthlyUsd*.8});
  }catch(e){return studioFailure(e);}
}
