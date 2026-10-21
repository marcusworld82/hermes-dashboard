import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ResearchSource } from './business-settings.ts';

export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  // Only global-unicast IPv6. Exclude documentation and transition/reserved ranges.
  return isIP(address) === 6 && /^[23][a-f\d]{0,3}:/i.test(address) && !/^2001:(?:db8|0|10|20|2):/i.test(address) && !/^2002:/i.test(address);
}
export function publicFeedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !url.hostname.includes('.') || isIP(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw Error('RSS needs a public HTTPS hostname on port 443.');
  return url;
}
export async function readPublicFeed(value: string) {
  const url = publicFeedUrl(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw Error('RSS hostname resolves to a private or reserved address.');
  const pinned = addresses[0];
  return new Promise<string>((resolve, reject) => {
    // Pin the validated address to prevent DNS rebinding between check and connection.
    const request = https.get(url, { family: pinned.family, lookup: (_host, _opts, callback) => callback(null, pinned.address, pinned.family), headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'User-Agent': 'Marcus OSRSS/1.0' }, timeout: 8000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(Error(`RSS returned HTTP ${response.statusCode}. Redirects are not followed.`)); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 1000000) request.destroy(Error('RSS feed exceeds the 1 MB limit.')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); response.on('error', () => reject(Error('RSS response failed.')));
    });
    const deadline=setTimeout(()=>request.destroy(Error('Public source exceeded its total time limit.')),12000);
    request.on('close',()=>clearTimeout(deadline));
    request.on('timeout', () => request.destroy(Error('RSS request timed out.')));
    request.on('error', () => reject(Error('Public RSS request failed or timed out.')));
  });
}
export type FeedItem = { title: string; link: string; publishedAt: string | null; source: string; sourceId: string; fetchedAt: number };
function plain(value: string) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 300); }
export function parsePublicFeed(xml: string, source: ResearchSource, now = Date.now()): FeedItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('RSS feed contains unsupported XML declarations.');
  if (!/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(xml)) throw Error('Source did not return an RSS or Atom feed.');
  const chunks = [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, 20);
  return chunks.flatMap(match => {
    const field = (name: string) => match[1].match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
    const title = plain(field('title'));
    const link = plain(field('link')) || match[1].match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || '';
    if (!link) return [];
    let parsed: URL; try { parsed = publicFeedUrl(new URL(link, source.value).href); } catch { return []; }
    if (!title) return [];
    const date = plain(field('pubDate') || field('published') || field('updated'));
    return [{ title, link: parsed.href, publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null, source: source.value, sourceId: source.id, fetchedAt: now }];
  });
}
export async function researchRssSources(sources: ResearchSource[], reader = readPublicFeed, now = Date.now()) {
  const enabled = sources.filter(source => source.enabled);
  const selected = enabled.filter(source => source.type === 'rss').slice(0, 20);
  const items: FeedItem[] = [], results: { id: string; source: string; status: string; count: number; error?: string }[] = [];
  for (let start = 0; start < selected.length; start += 4) {
    const batch = await Promise.all(selected.slice(start, start + 4).map(async source => {
      try { const found = parsePublicFeed(await reader(source.value), source, now); return { source, found, error: null }; }
      catch (error) { return { source, found: [], error: error instanceof Error ? error.message : 'RSS read failed.' }; }
    }));
    for (const entry of batch) { items.push(...entry.found); results.push({ id: entry.source.id, source: entry.source.value, status: entry.error ? 'error' : 'ok', count: entry.found.length, ...(entry.error ? { error: entry.error } : {}) }); }
  }
  for (const source of enabled.filter(source => !selected.includes(source))) results.push({ id: source.id, source: source.value, status: 'skipped', count: 0, error: source.type === 'rss' ? 'Maximum 20 RSS sources per morning.' : 'Only free public RSS research is automated. This source needs a separate approved connector.' });
  return { checkedAt: now, items, sources: results, noSources: enabled.length === 0 };
}
