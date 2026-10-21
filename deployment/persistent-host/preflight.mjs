import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';

// Local validation only. Does not contact providers, enable services or print secrets.
const failures = [];
const env = process.env;
if (Number(process.versions.node.split('.')[0]) < 24) failures.push('Use a supported Node version with node:sqlite and TypeScript stripping.');
if (env.HERMES_DEPLOYMENT_MODE !== 'persistent-host') failures.push('Set HERMES_DEPLOYMENT_MODE=persistent-host.');
if (env.HERMES_PERSISTENT_DISK_CONFIRMED !== 'true') failures.push('Confirm the reviewed persistent disk with HERMES_PERSISTENT_DISK_CONFIRMED=true.');
if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) failures.push('This package requires a persistent server, not serverless functions.');
const host = env.DASHBOARD_HOSTS || '';
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || /REPLACE|localhost/i.test(host)) failures.push('Set one real HTTPS hostname in DASHBOARD_HOSTS.');
if (env.GMAIL_PROVIDER === 'google') {
  if (env.GMAIL_REDIRECT_URI !== `https://${host}/api/gmail/callback`) failures.push('GMAIL_REDIRECT_URI must match the public host and callback.');
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET']) if (!env[key]) failures.push(`${key} is missing.`);
} else {
  if (env.COMPOSIO_CALLBACK_URL !== `https://${host}/api/gmail/composio/callback`) failures.push('COMPOSIO_CALLBACK_URL must match the public host and callback.');
  for (const key of ['COMPOSIO_API_KEY', 'COMPOSIO_GMAIL_AUTH_CONFIG_ID']) if (!env[key]) failures.push(`${key} is missing.`);
}
if (!env.NOTION_API_TOKEN) failures.push('NOTION_API_TOKEN is missing.');
for (const [key, value] of Object.entries({NOTION_COMPANIES_DATA_SOURCE_ID:'e52e94bc-1536-4467-b595-80cafadf63fa', NOTION_PEOPLE_DATA_SOURCE_ID:'a814d082-803b-4f07-b69d-81afadd329cb'})) {
  if (env[key] !== value) failures.push(`${key} must match the reviewed master source.`);
}
try {
  const key = Buffer.from(env.GMAIL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw Error();
  createCipheriv('aes-256-gcm', key, randomBytes(12));
} catch { failures.push('GMAIL_TOKEN_ENCRYPTION_KEY must encode 32 random bytes.'); }
const data = env.HERMES_DATA_DIR || '';
if (data !== '/var/lib/hermes') failures.push('This reviewed service package uses /var/lib/hermes for persistent state.');
else {
  try {
    if (!fs.statSync(data).isDirectory() || fs.lstatSync(data).isSymbolicLink()) throw Error();
    fs.accessSync(data, fs.constants.R_OK | fs.constants.W_OK);
  } catch { failures.push('Create /var/lib/hermes, owned by hermes and writable by that service user.'); }
}
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE preflight(id INTEGER PRIMARY KEY); BEGIN IMMEDIATE; INSERT INTO preflight VALUES(1); COMMIT;');
db.close();
for (const file of ['.next/BUILD_ID', 'scripts/cloud-mail-server.mjs', 'team.json']) {
  if (!fs.existsSync(path.resolve(file))) failures.push(`Missing deployment file: ${file}.`);
}
if (failures.length) {
  for (const message of failures) console.error(message);
  process.exitCode = 1;
} else {
  console.log('Local prerequisites passed. No service enabled and no external acceptance test performed.');
  console.log(`Configuration host fingerprint: ${createHash('sha256').update(host).digest('hex').slice(0, 12)}`);
  console.log(env.HERMES_LEGACY_SENDER_DISABLED === 'true' ? 'Legacy sender shutdown is attested. Verify it before activation.' : 'Sending remains blocked until both old senders are off and shutdown is attested.');
}
