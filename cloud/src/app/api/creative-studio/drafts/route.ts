import {connection} from 'next/server';
import {studioDraftStore,validateStudioDraft} from '@/lib/server/studio-drafts';
import {sameOrigin} from '@/lib/server/creative-studio-runtime';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){await connection();try{return Response.json({drafts:await studioDraftStore().list()},{headers});}catch{return Response.json({error:'Cloud draft storage is unavailable. Browser drafts remain available.'},{status:503,headers});}}
export async function POST(request:Request){try{sameOrigin(request);}catch{return Response.json({error:'Same-origin request required.'},{status:403,headers});}let draft;try{const text=await request.text();if(text.length>64000)throw Error();draft=validateStudioDraft(JSON.parse(text));}catch{return Response.json({error:'Invalid draft.'},{status:400,headers});}try{return Response.json({draft:await studioDraftStore().save(draft)},{status:201,headers});}catch{return Response.json({error:'Cloud save failed. Your browser copy is still available; retry cloud saving after setup.'},{status:503,headers});}}
