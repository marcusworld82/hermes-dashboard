import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {saveComposioSettings,getComposioSettings,composioSettingsStatus} from '../src/lib/server/composio-settings.ts';
test('Composio key stays encrypted on disk and absent from public status', async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marcus-composio-')); const file=path.join(directory,'settings.json');
 process.env.GMAIL_TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 const fetcher=async(url,init)=>{assert.equal(init.headers['x-api-key'],'private-test-key'); assert.match(url,/auth_configs$/); const body=JSON.parse(init.body);assert.equal(body.toolkit.slug,'gmail');return Response.json({auth_config:{id:'ac_test'}},{status:201});};
 const publicStatus=await saveComposioSettings({apiKey:'private-test-key'},fetcher,file);
 assert.equal(publicStatus.configured,true);assert.equal(publicStatus.authConfigId,'ac_test');assert.ok(!JSON.stringify(publicStatus).includes('private-test-key'));
 assert.ok(!fs.readFileSync(file,'utf8').includes('private-test-key'));assert.equal(fs.statSync(file).mode & 0o777,0o600);
 assert.equal(getComposioSettings(file).apiKey,'private-test-key');assert.equal(composioSettingsStatus(file).apiKeySet,true);
 fs.rmSync(directory,{recursive:true,force:true});
});
test('failed Composio setup exposes no upstream secret body and preserves settings', async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marcus-composio-'));const file=path.join(directory,'settings.json');
 await assert.rejects(saveComposioSettings({apiKey:'private-test-key'},async()=>new Response('secret echoed private-test-key',{status:401}),file),/Composio setup failed \(HTTP 401\)/);
 assert.equal(fs.existsSync(file),false);fs.rmSync(directory,{recursive:true,force:true});
});
