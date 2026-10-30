import {cutlinePath} from '@/lib/cutline-path';
export const maxDuration=300;
async function proxy(req:Request,context:{params:Promise<{path:string[]}>}) {
 const {path}=await context.params;if(!cutlinePath(path))return Response.json({error:'Unknown Cutline resource.'},{status:404});
 const route=path.join('/');
 if((route==='api/auto'||route==='api/new'||/\/(translate|transcribe)$/.test(route)))return Response.json({error:'Generation is off until the owner configures its provider and spending controls. Your existing edits are unchanged.'},{status:409});
 if(req.method==='POST'&&route==='api/studio')return Response.json({error:'Watch-folder and output-folder settings stay on your Mac. Change them in the original local Cutline app.'},{status:409});
 try{let body:BodyInit|undefined=req.method==='POST'?await req.arrayBuffer():undefined;const headers:Record<string,string>={};for(const key of ['content-type','range']){const value=req.headers.get(key);if(value)headers[key]=value;}if(req.method==='POST'&&route.endsWith('/srt')){const data=JSON.parse(new TextDecoder().decode(body as ArrayBuffer));if(typeof data.srt!=='string'||data.srt.length>1000000)return Response.json({error:'Invalid subtitles.'},{status:400});body=data.srt;headers['content-type']='text/plain';}const response=await fetch('http://127.0.0.1:4318/'+route+new URL(req.url).search,{method:req.method,headers,body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(270000)});const out=new Headers({'Cache-Control':'private, no-store'});for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(key);if(value)out.set(key,value);}return new Response(response.body,{status:response.status,headers:out});}catch{return Response.json({error:'Cutline on your Mac is not reachable. Your saved projects remain on your Mac.'},{status:503});}
}
export {proxy as GET,proxy as POST};
