import { handle } from '@/lib/server/http';
import { getBusinessSettings } from '@/lib/server/business-settings';
import { getRuntimeLeadEmailSnapshot as getLeadEmailSnapshot } from '@/lib/server/mail-runtime';
import { exactEmailDraft, eligibleLead } from '@/lib/server/mail-queue';
export async function GET(req: Request) { return handle(async () => {
  const query = new URL(req.url).searchParams;
  const id = query.get('id'); if (!id) throw Error('Choose a lead.');
  const kind = query.get('kind') === 'followup' ? 'followup' : 'first';
  const lead = await getLeadEmailSnapshot(id, kind); eligibleLead(lead, kind);
  return { id, kind, ...exactEmailDraft(lead, getBusinessSettings()) };
}); }
