import { getBusinessSettings } from '@/lib/server/business-settings';
import { handle } from '@/lib/server/http';
import { refreshLeadResearch } from '@/lib/server/lead-research';
import { readUnifiedLeads } from '@/lib/server/lead-actions';
export function GET() { return handle(async () => { await refreshLeadResearch(); const settings = getBusinessSettings(); return { ...readUnifiedLeads(), editingAvailable: process.env.HERMES_DEPLOYMENT_MODE !== 'persistent-host', thresholds: { hot: settings.hotThreshold, warm: settings.warmThreshold } }; }); }
