import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.ts';
import { mailStorageBlock } from './mail-queue-store.ts';
export type AutomationConsent = { at: number; morningHash?: string; capUsd?: number; actors?: Record<string, string>; senderHash?: string };
export type MorningStep = { name: string; status: 'ok' | 'skipped' | 'error' | 'running'; detail: string; data?: unknown };
export type MorningRecord = { day: string; claimedAt: number; finishedAt?: number; kind: string | null; steps: MorningStep[] };
export function createMorningStore(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS morning_runs(day TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS automation_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS automation_claims(key TEXT PRIMARY KEY,claimedAt INTEGER NOT NULL)');
  if (file !== ':memory:') fs.chmodSync(file, 0o600);
  return {
    claimOnce(key: string) { return db.prepare('INSERT OR IGNORE INTO automation_claims(key,claimedAt) VALUES(?,?)').run(key, Date.now()).changes === 1; },
    claim(record: MorningRecord) { return db.prepare('INSERT OR IGNORE INTO morning_runs(day,value) VALUES(?,?)').run(record.day, JSON.stringify(record)).changes === 1; },
    mutateRun(day: string, change: (record:MorningRecord)=>MorningRecord) { db.exec('BEGIN IMMEDIATE'); try {const row=db.prepare('SELECT value FROM morning_runs WHERE day=?').get(day);if(!row)throw Error('Morning record missing.');const record=change(JSON.parse(String(row.value)));db.prepare('UPDATE morning_runs SET value=? WHERE day=?').run(JSON.stringify(record),day);db.exec('COMMIT');return record;}catch(error){db.exec('ROLLBACK');throw error;}},
    update(record: MorningRecord) { db.prepare('UPDATE morning_runs SET value=? WHERE day=?').run(JSON.stringify(record), record.day); },
    runs() { return db.prepare('SELECT value FROM morning_runs ORDER BY day DESC LIMIT 14').all().map(row => JSON.parse(String(row.value)) as MorningRecord); },
    get<T>(key: string, fallback: T): T { const row = db.prepare('SELECT value FROM automation_meta WHERE key=?').get(key); return row ? JSON.parse(String(row.value)) : fallback; },
    set(key: string, value: unknown) { db.prepare('INSERT INTO automation_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); },
    close() { db.close(); },
  };
}
export function openMorningStore() { const block = mailStorageBlock(); if (block) throw Error(block); return createMorningStore(path.join(paths.data, 'morning-runs.sqlite')); }
