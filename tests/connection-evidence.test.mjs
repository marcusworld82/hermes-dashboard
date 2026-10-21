import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayEvidence, configuredMcp } from '../src/lib/server/connection-evidence.ts';
test('gateway process state is separate from past reply evidence',()=>{
 const record={kind:'hermes-gateway',pid:123,gateway_state:'running',served_profiles:['default','jordan']};
 assert.deepEqual(gatewayEvidence(record,true),{running:true,profiles:2});
 assert.deepEqual(gatewayEvidence(record,false),{running:false,profiles:0});
 assert.equal(gatewayEvidence({...record,gateway_state:'stopped'},true).running,false);
});
test('MCP local configuration reports names and flags without URLs or credentials',()=>{
 const rows=configuredMcp('mcp_servers:\n  notion:\n    url: https://private.invalid?token=SECRET\n  paused:\n    enabled: false\n    command: node\nother: true\n');
 assert.deepEqual(rows,[{name:'notion',enabled:true},{name:'paused',enabled:false}]);
 assert.ok(!JSON.stringify(rows).includes('SECRET'));
});

test('worker heartbeat becomes stale and rejects future or invalid timestamps',async()=>{
 const { heartbeatEvidence }=await import('../src/lib/server/connection-evidence.ts');
 assert.equal(heartbeatEvidence('2026-10-20T15:00:00Z',Date.parse('2026-10-20T15:02:59Z')).ok,true);
 assert.equal(heartbeatEvidence('2026-10-20T15:00:00Z',Date.parse('2026-10-20T15:03:01Z')).ok,false);
 assert.equal(heartbeatEvidence('invalid',Date.now()).ok,false);
 assert.equal(heartbeatEvidence('2026-10-20T16:00:00Z',Date.parse('2026-10-20T15:00:00Z')).ok,false);
});
