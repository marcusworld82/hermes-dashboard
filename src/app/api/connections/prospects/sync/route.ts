import {handle,body} from '@/lib/server/http';
import {syncBigin} from '@/lib/server/bigin-sync';
export async function POST(req:Request){return handle(async()=>{const data=await body(req);if(data.ids!==undefined&&(!Array.isArray(data.ids)||data.ids.length>100||data.ids.some(id=>typeof id!=='string')))throw Error('Select up to 100 prospects.');return syncBigin(data.ids as string[]|undefined);});}
