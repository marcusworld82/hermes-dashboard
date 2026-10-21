import {handle} from '@/lib/server/http';import {agentActivity} from '@/lib/server/agent-activity';
export async function GET(){return handle(()=>agentActivity());}
