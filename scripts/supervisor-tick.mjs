// The existing content LaunchAgent owns this tick. Do not install a second timer.
export async function tickSupervisor(request = fetch) {
  const local = 'http://127.0.0.1:3200';
  const routes = [];
  for (const route of ['workflows/tick', 'pipeline/reconcile', 'connections/prospects/outreach', 'connections/prospects/kits']) {
    try {
      const response = await request(`${local}/api/${route}`, {
        method: 'POST',
        headers: {origin: local, 'content-type': 'application/json'},
        body: JSON.stringify(route.endsWith('/outreach') ? {action: 'sync'} : {}),
        signal: AbortSignal.timeout(60000),
      });
      await response.body?.cancel();
      routes.push({route, ok: response.ok, error: response.ok ? null : `HTTP ${response.status}`});
    } catch {
      routes.push({route, ok: false, error: 'Local dashboard request failed'});
    }
  }
  return {checkedAt: new Date().toISOString(), routes};
}
