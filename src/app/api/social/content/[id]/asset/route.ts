import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pieceAsset } from '@/lib/server/content-machine';
import { byteRange } from '@/lib/server/content-uploads';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params;
 try{
  const kind=new URL(req.url).searchParams.get('kind');if(!['recording','cover','video'].includes(kind||''))return new Response('Unknown media',{status:400});
  const file=pieceAsset(id,kind as 'recording'|'cover'|'video');const size=fs.statSync(file).size;
  const mime=file.endsWith('.mp4')?'video/mp4':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'image/jpeg';
  const headers:Record<string,string>={'content-type':mime,'accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff'};
  let start=0,end=size-1,status=200;
  if(req.headers.has('range')){try{({start,end}=byteRange(req.headers.get('range')!,size));status=206;headers['content-range']=`bytes ${start}-${end}/${size}`;}catch{return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});}}
  // Bounded byte ranges keep cloud playback below the gateway's response size limit.
  if(mime==='video/mp4'&&end-start+1>2*1024*1024){end=start+2*1024*1024-1;status=206;headers['content-range']=`bytes ${start}-${end}/${size}`;}
  headers['content-length']=String(end-start+1);
  return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})) as ReadableStream,{status,headers});
 }catch{return new Response('Media not found',{status:404});}
}
