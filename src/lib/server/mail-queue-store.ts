import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { isPersistentMailHost, persistentMailHostBlock } from './persistent-mail-host.ts';
import { paths } from './paths.ts';

export type MailItem = {
  id: string; leadId: string; email: string; subject: string; body: string; draftHash: string; revision: string;
  approvedAt: number; status: 'queued' | 'paused' | 'sending' | 'sent' | 'cancelled' | 'unknown';
  kind: 'first' | 'followup'; parentId?: string; notBefore: number; attemptedAt?: number; sentAt?: number;
  gmailId?: string; threadId?: string; messageId: string; error?: string; replyAt?: number; bouncedAt?: number;
};
export type MailState = {
  account?: { email: string; encryptedTokens?: string; provider?: 'google' | 'composio'; connectedAccountId?: string; connectedAt: number; historyId: string; lastPollAt: number; pollError?: string };
  oauth?: { hash: string; browserHash: string; verifier: string; expires: number };
  composioOAuth?: { hash: string; browserHash: string; connectedAccountId: string; userId: string; authConfigId: string; expires: number };
  test?: { account: string; requestedAt: number; gmailId?: string; messageId: string; verifiedAt?: number; error?: string };
  items: MailItem[]; suppressed: Record<string, string>; paused: boolean; pauseReason?: string;
  nextReleaseAt: number; leaseUntil: number; seenMessages: string[]; notices: { id: string; at: number; text: string }[];
};
export function emptyMailState(): MailState { return { items: [], suppressed: {}, paused: true, pauseReason: 'Connect Gmail and verify a test before releasing the queue.', nextReleaseAt: 0, leaseUntil: 0, seenMessages: [], notices: [] }; }
// Implementations must provide a serializable transaction across all release workers.
export interface MailStore { read(): MailState; transaction<T>(fn: (state: MailState) => T): T; close(): void; }
export function createSqliteMailStore(file: string): MailStore {
  if (file !== ':memory:') { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS mail_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO mail_state(id,value) VALUES(1,?)').run(JSON.stringify(emptyMailState()));
  if (file !== ':memory:') fs.chmodSync(file, 0o600);
  const read = () => JSON.parse((db.prepare('SELECT value FROM mail_state WHERE id=1').get() as { value: string }).value) as MailState;
  return { read, transaction<T>(fn: (state: MailState) => T): T {
    db.exec('BEGIN IMMEDIATE');
    try { const state = read(); const result = fn(state); db.prepare('UPDATE mail_state SET value=? WHERE id=1').run(JSON.stringify(state)); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }, close: () => db.close() };
}
export function mailStorageBlock(env = process.env): string | null {
  if (isPersistentMailHost(env)) return persistentMailHostBlock(env);
  return env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY || env.K_SERVICE || env.HERMES_CLOUD === 'true' ? 'Cloud email is blocked. A shared durable database and authenticated release scheduler must be configured first. Local files are not cloud storage.' : null;
}
export function openMailStore(): MailStore {
  const block = mailStorageBlock(); if (block) throw Error(block);
  return createSqliteMailStore(path.join(paths.data, 'gmail-queue.sqlite'));
}
