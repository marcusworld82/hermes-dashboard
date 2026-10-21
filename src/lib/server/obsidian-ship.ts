import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

type Shipped = { id: string; title: string; kind: string; stage: string; shippedAt: number | null; plan: { summary: string } | null };
// Export only a small approved summary, never chat, credentials or full tool output.
export function saveShippedNote(vault: string, folder: string, item: Shipped, enabled: boolean): string | null {
  if (!enabled || item.stage !== 'shipped' || !item.shippedAt) return null;
  if (!folder || path.isAbsolute(folder) || folder.split(/[\\/]/).some(p => !p || p === '.' || p === '..')) throw Error('Use a folder inside the Obsidian vault.');
  if (!fs.statSync(vault).isDirectory() || fs.lstatSync(vault).isSymbolicLink()) throw Error('The configured vault must be a real directory.');
  let destination = path.resolve(vault);
  for (const part of folder.split(/[\\/]/)) {
    destination = path.join(destination, part);
    if (!fs.existsSync(destination)) fs.mkdirSync(destination, { mode: 0o700 });
    if (fs.lstatSync(destination).isSymbolicLink() || !fs.statSync(destination).isDirectory()) throw Error('Obsidian export cannot follow a linked folder.');
  }
  const key = createHash('sha256').update(item.id).digest('hex').slice(0, 24);
  const file = path.join(destination, `Hermes-${key}.md`);
  const title = item.title.replace(/[\r\n]/g, ' ').slice(0, 200);
  const text = `---\ntags: [hermes, shipped]\n---\n\n# ${title}\n\n${item.kind} completed ${new Date(item.shippedAt * 1000).toISOString()}.\n\n${item.plan?.summary.slice(0, 2000) || 'Approved work completed.'}\n\nCard: ${item.id.replace(/[\r\n]/g, ' ')}\n\n## Related\n\n- [[Hermes Dashboard Build Status - 2026-10-20]]\n`;
  try { fs.writeFileSync(file, text, {flag:'wx',mode:0o600}); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw Error('Obsidian export destination is not a regular note.');
  }
  return file;
}
