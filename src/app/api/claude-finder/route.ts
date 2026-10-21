import {body,handle} from '@/lib/server/http';
import {readFinder,startFinder} from '@/lib/server/claude-finder';
export async function GET(){return handle(()=>({job:readFinder(),available:!process.env.VERCEL&&process.env.HERMES_DEPLOYMENT_MODE!=='persistent-host'}));}
export async function POST(req:Request){return handle(async()=>{const b=await body<{approved?:boolean}>(req);if(b.approved!==true)throw Error('Approve the displayed effort first.');return {job:startFinder()};});}
