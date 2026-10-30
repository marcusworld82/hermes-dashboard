import {studioPrice} from '@/lib/server/studio-pricing';
import {sameOrigin,studioBody,studioJSON,studioFailure} from '@/lib/server/creative-studio-runtime';
import {StudioError,type Payload} from '@/lib/server/creative-studio-core';
export async function POST(request:Request){try{sameOrigin(request);const body=await studioBody(request);if(typeof body.model!=='string'||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new StudioError('INVALID_INPUT','Choose model settings.',400);return studioJSON(await studioPrice(body.model,body.payload as Payload));}catch(error){return studioFailure(error);}}
