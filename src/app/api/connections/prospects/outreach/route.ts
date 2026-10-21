import {connection} from 'next/server';
import {NextResponse} from 'next/server';
import {crmRequest,syncOutreach} from '@/lib/server/outreach';
import {readJson} from '@/lib/server/store';
export async function GET(){await connection();return NextResponse.json(readJson('outreach-sync',{}));}
export async function POST(req:Request){try{const p=await req.json();return NextResponse.json(p.action==='sync'?await syncOutreach(!!p.force):await crmRequest(p));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Outreach unavailable'},{status:409});}}
