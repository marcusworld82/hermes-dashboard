import {createHash} from 'node:crypto';
import {STUDIO_MODELS} from './creative-studio-models.ts';
import {HiggsfieldStudioProvider} from './creative-studio-provider.ts';
import {StudioError,type Payload} from './creative-studio-core.ts';
const cache=new Map<string,{usd:number;expiresAt:number}>();
/** Price lookup creates no reservation or generation. Unknown prices never become $0. */
export async function studioPrice(model:string,payload:Payload){
 const profile=STUDIO_MODELS.find(m=>m.id===model);
 if(!profile||profile.requiresSource||!profile.validate(payload))throw new StudioError('INVALID_MODEL_INPUT','Choose supported model settings. Saved-image prices use the signed-source quote flow.',400);
 const id=process.env.HF_API_KEY_ID?.trim(),secret=process.env.HF_API_KEY_SECRET?.trim();if(!id||!secret)throw new StudioError('PROVIDER_NOT_CONNECTED','Connect the Higgsfield API credentials in Hermes’s server settings to see current prices.',503);
 const key=createHash('sha256').update(JSON.stringify({model,payload})).digest('hex'),cached=cache.get(key);if(cached&&cached.expiresAt>Date.now())return cached;
 const result=await new HiggsfieldStudioProvider(STUDIO_MODELS,()=>({id,secret})).estimate(model,payload);
 const usd=result?.usd;if(typeof usd!=='number'||!Number.isFinite(usd)||usd<0)throw new StudioError('PRICE_UNKNOWN','The provider did not return a verified dollar price. Generation remains unavailable.',422);
 const value={usd,expiresAt:Date.now()+600000};if(cache.size>=100)cache.clear();cache.set(key,value);return value;
}
