import { isPersistentMailHost } from './persistent-mail-host.ts';
import { getBusinessSettings } from './business-settings.ts';
import { openMailStore, mailStorageBlock } from './mail-queue-store.ts';
import { composioSettingsStatus } from './composio-settings.ts';
import { preferredGmailProvider } from './composio-gmail.ts';

export function gmailSetupStatus(provider: 'google' | 'composio' = preferredGmailProvider()) {
  const composio = composioSettingsStatus();
  const missing = [...(provider === 'composio' ? composio.missing : ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI'].filter(name => !process.env[name])), ...['GMAIL_TOKEN_ENCRYPTION_KEY', ...(isPersistentMailHost() ? ['NOTION_API_TOKEN', 'NOTION_COMPANIES_DATA_SOURCE_ID', 'NOTION_PEOPLE_DATA_SOURCE_ID'] : [])].filter(name => !process.env[name])];
  const block = mailStorageBlock();
  return { missing, provider, preferredProvider: preferredGmailProvider(), callbackUrl: provider === 'composio' ? composio.callbackUrl : process.env.GMAIL_REDIRECT_URI || '', block, mode: block ? 'cloud-blocked' : isPersistentMailHost() ? 'persistent-host-sqlite' : 'local-sqlite', scheduler: getBusinessSettings().senderEnabled ? `Automatic release is enabled on the ${isPersistentMailHost() ? 'persistent host' : 'existing Mac'} worker. The queue must also be resumed.` : 'Automatic release is off. Use Release next, or activate the sender in Settings.' };
}
export function gmailStatus() {
  const setup = gmailSetupStatus();
  if (setup.block) return { ...setup, connected: false, email: null, test: null, paused: true, pauseReason: setup.block };
  const store = openMailStore();
  try {
    const value = store.read();
    return { ...gmailSetupStatus(value.account ? value.account.provider || 'google' : preferredGmailProvider()), connected: !!value.account, email: value.account?.email || null, connectedAt: value.account?.connectedAt || null, lastPollAt: value.account?.lastPollAt || null, pollError: value.account?.pollError || null, test: value.test ? { requestedAt: value.test.requestedAt, verifiedAt: value.test.verifiedAt || null, error: value.test.error || null, sent: !!value.test.gmailId } : null, paused: value.paused, pauseReason: value.pauseReason || null };
  } finally { store.close(); }
}
