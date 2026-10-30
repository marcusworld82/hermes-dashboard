import {handleSync} from '@/lib/server/sync-handler.mjs';
import {saveState,readState} from '@/lib/server/cloud-state';
export const maxDuration=60;
export async function POST(req:Request){return handleSync(req,{secret:process.env.HERMES_BRIDGE_KEY,readState,saveState})}
