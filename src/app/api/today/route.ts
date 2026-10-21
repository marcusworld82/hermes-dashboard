import {handle} from '@/lib/server/http';
import {today} from '@/lib/server/today';
export async function GET(){return handle(()=>today());}
