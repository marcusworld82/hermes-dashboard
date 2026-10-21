import { handle, body } from '@/lib/server/http';
import { agentControlRequest } from '@/lib/server/agent-controls';
import { readTeam } from '@/lib/server/agents';
async function valid(context:{params:Promise<{id:string}>}) {const {id}=await context.params;if(!readTeam().agents.some(a=>a.id===id))throw Error('Choose an agent from the team.');return id;}
export function GET(_req:Request,context:{params:Promise<{id:string}>}){return handle(async()=>agentControlRequest(await valid(context),'read'));}
export function POST(req:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const input=await body<Record<string,unknown>>(req);return agentControlRequest(await valid(context),String(input.action),input);});}
