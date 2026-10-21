import {handle} from '@/lib/server/http';
import {prospectLibrary} from '@/lib/server/prospect-library';
export async function GET(){return handle(()=>prospectLibrary());}
