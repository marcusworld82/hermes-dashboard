import {NextRequest,NextResponse} from 'next/server';
import {sameOrigin} from './lib/server/security.mjs';
import {linkPublicWriteRestriction,publicActionBodyRequired} from './lib/server/link-public.mjs';
export async function proxy(req:NextRequest){
 const p=req.nextUrl.pathname;
 // Sync still authenticates its own bridge bearer; signed image delivery verifies
 // its own HMAC. Neither provider protection is removed with the dashboard gate.
 if(p==='/api/sync'||p.startsWith('/_next/')||p==='/favicon.ico')return NextResponse.next();
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!sameOrigin(req.headers.get('origin'),req.headers.get('host')))return NextResponse.json({error:'Request origin does not match.'},{status:403});
 let body;
 if(publicActionBodyRequired(p,req.method)){
  if(Number(req.headers.get('content-length')||0)>131072)return NextResponse.json({error:'Request too large.'},{status:413});
  try{const raw=await req.clone().text();if(raw.length>131072)return NextResponse.json({error:'Request too large.'},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({error:'Use a JSON request.'},{status:400});}
 }
 const blocked=linkPublicWriteRestriction(p,req.method,body);if(blocked)return NextResponse.json({error:blocked},{status:403});
 const res=NextResponse.next();res.headers.set('Cache-Control','private, no-store');res.headers.set('X-Robots-Tag','noindex, nofollow');return res;
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
