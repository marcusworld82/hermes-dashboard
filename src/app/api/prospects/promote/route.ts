import {body,handle} from '@/lib/server/http';
import {previewProspectPromotion,confirmProspectPromotion} from '@/lib/server/prospect-promotion';
export async function POST(req:Request){return handle(async()=>{const input=await body<{action?:string;ids?:string[];token?:string;confirmed?:boolean}>(req);if(input.action==='preview')return previewProspectPromotion(input.ids||[]);if(input.action==='confirm')return confirmProspectPromotion(input.token,input.confirmed);throw Error('Choose preview or confirm.');});}
