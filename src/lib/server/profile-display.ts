import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.ts';
// Read only presentation fields from Hermes's small metadata file, never config or credentials.
export function metadataText(yaml: string, key: 'display_name' | 'description'): string | null {
  const lines = yaml.split('\n');
  const index = lines.findIndex(line => line.startsWith(`${key}:`));
  if (index < 0) return null;
  let value = lines[index].slice(key.length + 1).trim();
  if (/^[|>][+-]?$/.test(value)) {
    const block: string[] = [];
    for (let i = index + 1; i < lines.length && (/^\s/.test(lines[i]) || !lines[i]); i++) block.push(lines[i].replace(/^  /, ''));
    return (value.startsWith('>') ? block.join(' ') : block.join('\n')).trim();
  }
  for (let i = index + 1; i < lines.length && (/^\s/.test(lines[i]) || !lines[i]); i++) value += ' ' + lines[i].trim();
  value = value.trim();
  if (value.startsWith('"')) { try { return JSON.parse(value); } catch { return null; } }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value || '';
}
export function profileDisplay(id: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) return {};
  try { const yaml = fs.readFileSync(path.join(paths.hermesHome, 'profiles', id, 'profile.yaml'), 'utf8'); return { displayName: metadataText(yaml, 'display_name'), description: metadataText(yaml, 'description') }; } catch { return {}; }
}
