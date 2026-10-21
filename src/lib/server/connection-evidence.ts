export function gatewayEvidence(record: unknown, alive: boolean) {
  const state = record as { kind?: string; gateway_state?: string; served_profiles?: unknown[] } | null;
  const running = alive && state?.kind === "hermes-gateway" && state.gateway_state === "running";
  return { running, profiles: running && Array.isArray(state.served_profiles) ? state.served_profiles.length : 0 };
}

export function configuredMcp(config: string) {
  const block = config.match(/^mcp_servers:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? "";
  return [...block.matchAll(/^  ([\w.-]+):\s*\n((?: {4,}.*\n?)*)/gm)].map((match) => ({
    name: match[1], enabled: !/^\s+enabled:\s*false\s*$/m.test(match[2]),
  }));
}

export function replyEvidence(health: { checkedAt: number; agents: { ok: boolean }[] } | null, now = Date.now()) {
  const checkedAt = Number(health?.checkedAt) * 1000;
  const ageHours = Number.isFinite(checkedAt) ? Math.max(0, (now - checkedAt) / 3600000) : null;
  const stale = ageHours === null || ageHours > 24 || checkedAt > now;
  const total = health?.agents?.length || 0;
  const passed = health?.agents?.filter((agent) => agent.ok).length || 0;
  return { ok: !stale && total > 0 && passed === total, stale, ageHours, checkedAt, total, passed };
}

export function probeDetail(evidence: { ok: boolean; checkedAt: number; error?: string; detail?: string; cost?: number | null } | undefined, now = Date.now()) {
  if (!evidence) return { ok: false, detail: 'Not tested. Configuration alone does not confirm access.' };
  const stale = now - evidence.checkedAt > 86400000 || evidence.checkedAt > now;
  const when = new Date(evidence.checkedAt).toISOString();
  const cost = evidence.cost === undefined ? '' : evidence.cost === null ? ' Actual cost was not returned by the provider.' : ` Actual cost: $${evidence.cost.toFixed(8)}.`;
  return { ok: evidence.ok && !stale, detail: `${evidence.ok ? 'Authenticated' : 'Failed'}, last checked ${when}. ${evidence.error || evidence.detail || ''}${stale ? ' Stale, check again.' : ''}${cost}` };
}

export function heartbeatEvidence(checkedAt: string | undefined, now = Date.now()) {
  const age = now - Date.parse(checkedAt || '');
  return { ok: Number.isFinite(age) && age >= 0 && age < 180000, checkedAt: checkedAt || null };
}
