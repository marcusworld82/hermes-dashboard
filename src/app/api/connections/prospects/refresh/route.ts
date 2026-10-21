import {handle,body} from '@/lib/server/http';
import {syncBigin} from '@/lib/server/bigin-sync';
import {refreshNotion} from '@/lib/server/notion-prospects';
export async function POST(req:Request){return handle(async()=>{const data=await body(req);const result=await refreshNotion(data.force===true);if(!result.skipped){try{await syncBigin();}catch{return {...result,biginError:'Bigin could not refresh. Last known links were kept.'};}}return result;});}
