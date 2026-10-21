import { handle } from '@/lib/server/http';
import { gmailStatus } from '@/lib/server/gmail-status';
export async function GET() { return handle(gmailStatus); }
