import { handle } from '@/lib/server/http';
import { listThreads } from '@/lib/server/chat';
export function GET() { return handle(() => ({ threads: listThreads().slice(0, 8).map(({id,title,updatedAt})=>({id,title,updatedAt})) })); }
