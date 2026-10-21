import {handle,body} from '@/lib/server/http';
import {probeProspectConnection} from '@/lib/server/prospect-connections';
export async function POST(req:Request){return handle(async()=>{
 const b=await body<{name?:string}>(req);
 if(b.name!=='bigin'&&b.name!=='notion')throw new Error('Choose Bigin or Notion.');
 return probeProspectConnection(b.name);
});}
