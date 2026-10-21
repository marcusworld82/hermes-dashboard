import {createHash,timingSafeEqual} from 'node:crypto';
import {makeSession,sameOrigin} from '@/lib/server/security.mjs';
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(!sameOrigin(origin,req.headers.get('host')))return new Response('Invalid origin',{status:403});
 const data=await req.formData();const password=String(data.get('password')??'');const expected=process.env.HERMES_PASSWORD_HASH??'';
 const actual=createHash('sha256').update(password).digest('hex');
 if(!expected||expected.length!==actual.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){await new Promise(r=>setTimeout(r,750));return new Response('Incorrect password. Return to the sign-in page and try again.',{status:401,headers:{'Cache-Control':'no-store'}})}
 const cookie=makeSession(process.env.HERMES_SESSION_SECRET??'');
 return new Response(null,{status:303,headers:{Location:'/social','Set-Cookie':`hermes_session=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,'Cache-Control':'no-store'}});
}
