import {callComposioMcpTool} from './composio-mcp.ts';
type Runner=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
type Json=Record<string,unknown>;
function record(value:unknown):Json|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Json:null;}
function unpack(result:unknown):Json{
 const envelope=record(result);
 if(!envelope||envelope.isError===true)throw Error('Composio connection check failed. Sign in again and retry.');
 if(envelope.structuredContent)return unpack(envelope.structuredContent);
 if(Array.isArray(envelope.content)){
  for(const item of envelope.content){const block=record(item);if(block?.type==='text'&&typeof block.text==='string'&&block.text.length<1000000){try{return unpack(JSON.parse(block.text));}catch(error){if(error instanceof SyntaxError)continue;throw error;}}}
  throw Error('Composio connection check failed.');
 }
 if(envelope.successful===false||envelope.success===false||envelope.error)throw Error('Composio connection check failed.');
 return envelope;
}
function find(value:unknown,key:string,depth=0):unknown{
 if(depth>8)return;
 const obj=record(value);if(obj&&obj[key]!==undefined)return obj[key];
 for(const entry of Array.isArray(value)?value:Object.values(obj||{})){const match=find(entry,key,depth+1);if(match!==undefined)return match;}
}
export async function checkComposioMcpGmail(connectMissing=false,run:Runner=callComposioMcpTool){
 const search=unpack(await run('COMPOSIO_SEARCH_TOOLS',{queries:[{use_case:'Check Gmail account connection for reading and sending email, without reading or sending messages'}],session:{generate_id:true}}));
 const statuses=find(search,'toolkit_connection_statuses');
 const status=Array.isArray(statuses)?statuses.map(record).find(s=>s?.toolkit==='gmail'):null;
 if(!status)throw Error('Composio did not return Gmail connection status. Try checking again.');
 const accounts=(Array.isArray(status.accounts)?status.accounts:[]).map(record).filter(a=>a?.status==='ACTIVE'&&typeof a.id==='string').map(a=>({id:a!.id as string,email:typeof record(a!.user_info)?.email==='string'?record(a!.user_info)!.email as string:null,alias:typeof a!.alias==='string'?a!.alias:null}));
 const result:{active:boolean;accounts:typeof accounts;checkedAt:number;url?:string}={active:status.has_active_connection===true&&accounts.length>0,accounts,checkedAt:Date.now()};
 if(!result.active&&connectMissing){
  const session=record(find(search,'session'));
  const connected=unpack(await run('COMPOSIO_MANAGE_CONNECTIONS',{toolkits:[{name:'gmail',action:'add'}],...(typeof session?.id==='string'?{session_id:session.id}:{})}));
  const raw=find(connected,'redirect_url');
  let url:URL;try{url=new URL(typeof raw==='string'?raw:'');}catch{throw Error('Composio did not return a valid Composio sign-in link.');}
  if(url.protocol!=='https:'||!['connect.composio.dev','backend.composio.dev'].includes(url.hostname)||url.port||url.username||url.password)throw Error('Composio did not return a valid Composio sign-in link.');
  result.url=url.href;
 }
 return result;
}
