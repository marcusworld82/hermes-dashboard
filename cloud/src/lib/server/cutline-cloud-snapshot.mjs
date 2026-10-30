import { CutlineError } from './cutline-cloud-core.mjs';
/** Explicit owner task only. Never called by build, HTTP or fallback. The caller
 * must reserve an approved setup budget first. This file does not execute itself.
 * Bundle licensed font/GSAP files after setup using writeFiles before snapshot.
 */
export async function prepareApprovedCutlineSnapshot({ Sandbox, approval, versions, trustedFiles = [] }) {
  if (!approval || approval.authorized !== true || !approval.reservationId || !(approval.maxSetupMs > 0 && approval.maxSetupMs <= 900000)) throw new CutlineError('SETUP_NOT_AUTHORIZED', 'Snapshot preparation requires explicit approval and a setup reservation.', 503);
  for (const name of ['hyperframes', 'ffmpegStatic', 'ffprobeStatic']) if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(versions?.[name] || '')) throw new CutlineError('PIN_REQUIRED', 'Exact renderer and FFmpeg versions are required.');
  if (trustedFiles.some(f => !/^assets\/[a-zA-Z0-9_-]+\.(?:woff2|js)$/.test(f.path) || !Buffer.isBuffer(f.content))) throw new CutlineError('INVALID_ASSET', 'Snapshot assets must be approved local font or JS files.');
  const sandbox = await Sandbox.create({ runtime: 'node22', timeout: approval.maxSetupMs, resources: { vcpus: 2 } });
  const run = async opts => { const result = await sandbox.runCommand(opts); if (result.exitCode !== 0) throw new CutlineError('SETUP_FAILED', 'Snapshot preparation command failed.'); };
  try {
    await run({ cmd: 'dnf', args: ['install', '-y', '--setopt=install_weak_deps=False', 'nss', 'nspr', 'atk', 'at-spi2-atk', 'cups-libs', 'libdrm', 'libxkbcommon', 'libXcomposite', 'libXdamage', 'libXext', 'libXfixes', 'libXrandr', 'mesa-libgbm', 'alsa-lib', 'pango'], sudo: true });
    await run({ cmd: 'npm', args: ['install', '--no-save', '--no-audit', '--no-fund', `hyperframes@${versions.hyperframes}`, `ffmpeg-static@${versions.ffmpegStatic}`, `ffprobe-static@${versions.ffprobeStatic}`] });
    await run({ cmd: 'ln', args: ['-sf', '/vercel/sandbox/node_modules/ffmpeg-static/ffmpeg', '/usr/local/bin/ffmpeg'], sudo: true });
    await run({ cmd: 'ln', args: ['-sf', '/vercel/sandbox/node_modules/ffprobe-static/bin/linux/x64/ffprobe', '/usr/local/bin/ffprobe'], sudo: true });
    await run({ cmd: 'node_modules/.bin/hyperframes', args: ['browser', 'ensure'] });
    if (trustedFiles.length) await sandbox.writeFiles(trustedFiles);
    await sandbox.update({ networkPolicy: 'deny-all' });
    const snapshot = await sandbox.snapshot({ expiration: 7 * 86400000 });
    return { snapshotId: snapshot.snapshotId, versions: { ...versions }, reservationId: approval.reservationId };
  } finally { await sandbox.stop(); }
}
