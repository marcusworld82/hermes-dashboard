import {handle,body,isLocalHost} from '@/lib/server/http';
import {composioSettingsStatus,saveComposioSettings} from '@/lib/server/composio-settings';
import {isPersistentMailHost} from '@/lib/server/persistent-mail-host';
export async function GET(){return handle(composioSettingsStatus);}
export async function POST(req:Request){return handle(async()=>{
 if(!isLocalHost(req.headers.get('host')) || isPersistentMailHost() || process.env.VERCEL) throw Error('Add Composio credentials on this Mac, or use private server environment settings on your host.');
 return saveComposioSettings(await body(req));
});}
