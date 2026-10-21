import crypto from 'node:crypto';

function encryptionKey(value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || '') {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw Error('Set GMAIL_TOKEN_ENCRYPTION_KEY to a private 32-byte base64 key on the server.');
  return key;
}
export function encryptGmailSecret(value: unknown, key?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from('hermes-gmail-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptGmailSecret<T>(value: string, key?: string): T {
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw Error();
    const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from('hermes-gmail-v1')); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8'));
  } catch { throw Error('Gmail credentials could not be decrypted. Restore the server encryption key or reconnect Gmail.'); }
}
export const secretHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export function equalHash(a: string, b: string) { return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
