import {NextRequest,NextResponse} from 'next/server';
import {validSession,sameOrigin} from './lib/server/security.mjs';
export function proxy(req:NextRequest){
 const p=req.nextUrl.pathname;
 if(p==='/login'||p==='/api/auth'||p==='/api/sync'||p.startsWith('/_next/')||p==='/favicon.ico')return NextResponse.next();
 if(!validSession(req.cookies.get('hermes_session')?.value??'',process.env.HERMES_SESSION_SECRET??'')){
  if(p.startsWith('/api/'))return NextResponse.json({error:'Sign in to Marcus OS.'},{status:401});
  return NextResponse.redirect(new URL('/login',req.url));
 }
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const origin=req.headers.get('origin');
  if(!sameOrigin(origin,req.headers.get('host')))return NextResponse.json({error:'Request origin does not match.'},{status:403});
 }
 const res=NextResponse.next();res.headers.set('Cache-Control','private, no-store');res.headers.set('X-Robots-Tag','noindex, nofollow');return res;
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
