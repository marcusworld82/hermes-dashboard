import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { paths } from './paths.ts';
export type AgentEditorState = { displayName: string; description: string; model: string; soul: string; enabledSkills: string[] };
export type AgentEditorSnapshot = { ok: boolean; id: string; state: AgentEditorState; revision: string; provider: string; availableModels: string[]; availableSkills: string[]; runtimeNote: string; capabilities: { pause: boolean; dailyBudget: boolean }; history?: { id: string; at: string; status: string }[] };
export type AgentEditorPreview = { ok: boolean; state: AgentEditorState; revision: string; previewHash: string; diff: string; changed: boolean };
const exec = promisify(execFile);
export async function runAgentEditor<T>(id: string, payload: Record<string, unknown>): Promise<T> {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw Error('Choose a valid agent.');
  const runtime = await exec(paths.hermesBin, ['--print-runtime-command'], { timeout: 10000 });
  const [python] = JSON.parse(runtime.stdout);
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', path.join(process.cwd(), 'scripts/agent-editor.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', settled = false;
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(Error('The editor timed out. Check the audit before retrying.')); }, 150000);
    function finish(error?: Error, result?: T) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(result!); }
    child.on('error', () => finish(Error('The Marcus OS editor runtime is unavailable.')));
    child.stdin.on('error', () => finish(Error('The Marcus OS editor did not accept this request.')));
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2_000_000) { child.kill('SIGTERM'); finish(Error('The editor returned too much data.')); } });
    child.stderr.on('data', () => {});
    child.on('close', code => {
      if (code !== 0) return finish(Error('The Marcus OS editor did not confirm the change.'));
      try { const result = JSON.parse(stdout.trim().split('\n').at(-1)!); if (!result.ok) return finish(Error(typeof result.error === 'string' ? result.error : 'The profile operation failed.')); finish(undefined, result); }
      catch { finish(Error('The Marcus OS editor returned an invalid result.')); }
    });
    child.stdin.end(JSON.stringify({ ...payload, id }));
  });
}
