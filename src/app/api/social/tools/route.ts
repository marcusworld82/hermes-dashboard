import {handle,body} from '@/lib/server/http';
import {listToolJobs,queueToolJob} from '@/lib/server/tool-jobs';
import {requireRuns} from '@/lib/server/settings';
import {toolStatus,startTool,isTool} from '@/lib/server/tools';
export async function GET(){return handle(async()=>({jobs:listToolJobs(),tools:await Promise.all(['recast','openadkit'].map(id=>toolStatus(id as 'recast'|'openadkit')))}));}
export async function POST(req:Request){return handle(async()=>{const input=await body(req);if(input.action==='start'&&typeof input.tool==='string'&&isTool(input.tool))return startTool(input.tool);requireRuns();return queueToolJob(input);});}
