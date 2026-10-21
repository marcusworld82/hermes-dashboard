import {handle,body} from '@/lib/server/http';
import {checkComposioMcpGmail} from '@/lib/server/composio-mcp-gmail';
export async function POST(req:Request){return handle(async()=>{
 const input=await body<{connectMissing?:boolean}>(req);
 if(input.connectMissing!==undefined&&typeof input.connectMissing!=='boolean')throw Error('Choose whether to connect Gmail.');
 return checkComposioMcpGmail(input.connectMissing===true);
});}
