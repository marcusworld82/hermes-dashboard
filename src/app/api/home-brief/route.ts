import { readUnifiedLeads } from '@/lib/server/lead-actions';
import { summarizeHomeLeads } from '@/lib/server/home-lead-summary';
import { readContentIdeas } from '@/lib/server/morning-content';
import { handle } from '@/lib/server/http';
import { readClients } from '@/lib/server/clients';
import { morningStatus } from '@/lib/server/morning-run';
import { mailStorageBlock, openMailStore } from '@/lib/server/mail-queue-store';

export async function GET() {
  return handle(() => {
    const clients = readClients();
    const morning = morningStatus();
    const block = mailStorageBlock();
    const store = block ? null : openMailStore();
    try {
      const mail = store?.read();
      const inbox = readUnifiedLeads();
      return {
        leads: { ...summarizeHomeLeads(inbox.leads, mail?.items ?? []), checkedAt: inbox.checkedAt, error: inbox.error },
        contentIdeas: readContentIdeas(),
        clients: { counts: clients.counts, checkedAt: clients.checkedAt, error: clients.error },
        morning: { enabled: morning.settings.automaticMorningRun, runs: morning.runs.slice(0, 1), rss: morning.rss },
        mail: {
          queued: mail?.items.filter(item => item.status === 'queued').length ?? 0,
          replied: mail?.items.filter(item => item.replyAt).length ?? 0,
          uncertain: mail?.items.filter(item => item.status === 'unknown').length ?? 0,
          paused: mail?.paused ?? true,
          pauseReason: block ?? mail?.pauseReason ?? null,
          notices: mail?.notices.slice(-5).reverse() ?? [],
        },
      };
    } finally { store?.close(); }
  });
}
