import { body, handle } from '@/lib/server/http';
import { requireRuns } from '@/lib/server/settings';
import { postizClient } from '@/lib/server/postiz';
import { getPiece, updatePiece, enqueueStage, approveScript, approvePiece, schedulePiece, resolvePublication, type ContentPiece, type ContentStage } from '@/lib/server/content-machine';
type Ctx={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Ctx){const {id}=await ctx.params;return handle(()=>({piece:getPiece(id)}));}
export async function PATCH(req:Request,ctx:Ctx){const {id}=await ctx.params;const b=await body<Partial<ContentPiece>>(req);return handle(()=>({piece:updatePiece(id,b)}));}
export async function POST(req:Request,ctx:Ctx){const {id}=await ctx.params;const b=await body<{action:string;channelIds?:string[];when?:string;outcome?:string;options?:unknown}>(req);return handle(async()=>{
 if(['research','script','build','cover'].includes(b.action)){requireRuns();return {piece:enqueueStage(id,b.action as ContentStage)};}
 if(b.action==='approve-script')return {piece:approveScript(id)};
 if(b.action==='approve')return {piece:approvePiece(id,{channelIds:b.channelIds||[],when:b.when||'',options:b.options})};
 if(b.action==='schedule'){requireRuns();return {piece:await schedulePiece(id,postizClient())};}
 if(b.action==='resolve-publication'){if(!['scheduled','not-posted'].includes(b.outcome||''))throw Error('Choose a checked publication outcome.');return {piece:resolvePublication(id,b.outcome as 'scheduled'|'not-posted')};}
 throw Error('Unknown Content Machine action.');
});}
