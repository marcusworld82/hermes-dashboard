import {handle,body} from '@/lib/server/http';
import {readKits,startKitBatch,regenerateKit} from '@/lib/server/outreach-kits-run';

// GET: saved call, email and DM kits by prospect. POST {}: fill kits for new prospects (the worker calls this every minute).
// POST {action:'regenerate',id}: rewrite one prospect's kit now.
export async function GET(req:Request){return handle(()=>{const id=new URL(req.url).searchParams.get('id');const kits=readKits();return id?{kit:kits[id]||null}:{kits};});}
export async function POST(req:Request){return handle(async()=>{const data=await body(req);if(data.action==='regenerate'){if(typeof data.id!=='string'||data.id.length>100)throw Error('Pick a prospect.');return {kit:await regenerateKit(data.id)};}return startKitBatch();});}
