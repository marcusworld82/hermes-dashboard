import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CutlineError } from './cutline-cloud-core.mjs';
const hash = content => createHash('sha256').update(content).digest('hex');
/** Fixed server-owned directory, deliberately outside public/. No request paths,
 * arbitrary URLs or env-controlled filesystem roots are accepted. */
export async function loadCutlineTrustedAssets(cwd = process.cwd()) {
  const root = await realpath(path.join(cwd, 'cutline-runtime-assets'));
  async function file(name, digest, max = 16 * 1024 * 1024) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(name) || ['.', '..'].includes(name) || !/^[a-f0-9]{64}$/.test(digest || '')) throw new CutlineError('ASSETS_INVALID', 'Asset manifest entry is invalid.', 503);
    const target = await realpath(path.join(root, name)); if (path.dirname(target) !== root) throw new CutlineError('ASSETS_INVALID', 'Asset symlinks cannot leave the trusted bundle.', 503);
    const metadata = await stat(target); if (!metadata.isFile() || metadata.size < 1 || metadata.size > max) throw new CutlineError('ASSETS_INVALID', 'Asset size is invalid.', 503);
    const data = await readFile(target); if (!data.length || data.length > max || hash(data) !== digest) throw new CutlineError('ASSETS_INVALID', 'Asset digest or size mismatch.', 503);
    return data;
  }
  const manifestPath = await realpath(path.join(root, 'manifest.json'));
  if (path.dirname(manifestPath) !== root || (await stat(manifestPath)).size > 32768) throw new CutlineError('ASSETS_INVALID', 'Invalid asset manifest.', 503);
  const manifestBytes = await readFile(manifestPath);
  if (manifestBytes.length > 32768) throw new CutlineError('ASSETS_INVALID', 'Asset manifest is too large.', 503);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.fonts) || manifest.fonts.length > 48 || !manifest.gsap || !manifest.audio) throw new CutlineError('ASSETS_INVALID', 'Asset manifest schema is invalid.', 503);
  const engine = await readFile(path.join(cwd, 'public/cutline-assets/engine.js'));
  if (hash(engine) !== manifest.engineDigest) throw new CutlineError('ENGINE_MISMATCH', 'Preview engine does not match the approved manifest.', 503);
  const fonts = []; for (const font of manifest.fonts) fonts.push({ family: font.family, file: font.file, content: await file(font.file, font.sha256) });
  /** @type {Record<string, Buffer>} */
  const audio = {}; for (const name of ['whoosh.mp3', 'whoosh-heavy.mp3', 'click.wav']) { const entry = manifest.audio[name]; if (!entry) throw new CutlineError('ASSETS_INVALID', 'Required transition audio is absent.', 503); audio[name] = await file(entry.file, entry.sha256); }
  return { engine, engineDigest: manifest.engineDigest, gsap: await file(manifest.gsap.file, manifest.gsap.sha256), fonts, audio };
}
