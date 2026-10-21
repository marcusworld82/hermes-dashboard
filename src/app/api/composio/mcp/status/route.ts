import {connection} from 'next/server';
import {getComposioMcpStatus} from '@/lib/server/composio-mcp';
export async function GET(){await connection();return Response.json(getComposioMcpStatus(),{headers:{'Cache-Control':'no-store'}});}
