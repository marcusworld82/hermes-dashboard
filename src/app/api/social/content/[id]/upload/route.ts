import { handle } from '@/lib/server/http';
import { getPiece, pieceDirectory, importAsset } from '@/lib/server/content-machine';
import { receiveChunk } from '@/lib/server/content-uploads';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params;
 return handle(async()=>{
  if(Number(req.headers.get('content-length')||0)>750000)throw Error('Upload chunk is too large.');
  getPiece(id);
  const raw=await req.text();if(raw.length>750000)throw Error('Upload chunk is too large.');
  return receiveChunk(pieceDirectory(id),JSON.parse(raw),(kind,bytes,mime)=>importAsset(id,kind,bytes,mime));
 });
}
