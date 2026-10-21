import test from 'node:test';import assert from 'node:assert/strict';
import {finderArgs,finderBrief,finderEnvironment,claimFinderLock,releaseFinderLock} from '../src/lib/server/claude-finder.ts';
import {businessDefaults} from '../src/lib/server/business-settings.ts';
test('finder cannot use shell, Gmail or MCP and has a fixed cost ceiling',()=>{const args=finderArgs();assert.ok(!args.includes('--bare'));assert.ok(args.includes('--safe-mode'));assert.ok(args.includes('--restricted'));assert.ok(args.includes('--disable-slash-commands'));assert.ok(args.includes('--strict-mcp-config'));assert.equal(args[args.indexOf('--tools')+1],'WebSearch,WebFetch');assert.equal(args[args.indexOf('--max-budget-usd')+1],'1');});
test('finder refuses incomplete brief and expressly forbids sending',()=>{assert.throws(()=>finderBrief(businessDefaults,[]),/Settings/);const prompt=finderBrief({...businessDefaults,services:'Product photos',niche:'Small stores',location:'Ohio'},[]);assert.match(prompt,/Do not send/);assert.match(prompt,/20/);assert.match(prompt,/never claim.*sample/i);});

import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('finder keeps subscription OAuth and strips paid provider routing overrides',()=>{
 const env=finderEnvironment({CLAUDE_CODE_OAUTH_TOKEN:'fake-subscription',ANTHROPIC_API_KEY:'fake-key',ANTHROPIC_AUTH_TOKEN:'fake-token',ANTHROPIC_BASE_URL:'https://fake.invalid',CLAUDE_CODE_USE_BEDROCK:'1',CLAUDE_CODE_USE_VERTEX:'1',CLAUDE_CODE_USE_FOUNDRY:'1',CLAUDE_CODE_SIMPLE:'1',PATH:'/usr/bin'});
 assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN,'fake-subscription');assert.equal(env.PATH,'/usr/bin');
 for(const field of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY','CLAUDE_CODE_SIMPLE'])assert.equal(env[field],undefined);
});
test('finder lock is durable and only its owner can release it',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'finder-lock-'));
 try{claimFinderLock('first',directory);assert.throws(()=>claimFinderLock('second',directory),/saved run lock/);releaseFinderLock('second',directory);assert.throws(()=>claimFinderLock('third',directory),/saved run lock/);releaseFinderLock('first',directory);claimFinderLock('second',directory);releaseFinderLock('second',directory);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
import {finderFailure,readFinderEnvelope} from '../src/lib/server/claude-finder.ts';
test('finder distinguishes budget, usage, timeout and result errors without falsely blaming sign-in',()=>{
 assert.match(finderFailure(Object.assign(new Error('stopped'),{killed:true,signal:'SIGTERM'}),'research'),/three.minute/i);
 assert.match(finderFailure(new Error('Each lead needs a public contact source URL.'),'validate'),/contact source URL/);
 assert.doesNotMatch(finderFailure(new SyntaxError('bad JSON'),'response'),/sign.in/i);
 assert.match(finderFailure(new Error('unavailable'),'save'),/Notion/i);
 assert.match(finderFailure(Object.assign(new Error('exit'),{stderr:'Not logged in. Please run /login'}),'research'),/sign.in/i);
});
test('finder reads structured results and reports provider budget errors precisely',()=>{
 assert.throws(()=>readFinderEnvelope(JSON.stringify({is_error:true,subtype:'error_max_budget_usd',result:'sensitive provider details'})),/budget ceiling/i);
 assert.throws(()=>readFinderEnvelope(JSON.stringify({is_error:true,subtype:'error_during_execution',result:'private upstream text'})),/Claude reported a research error/);
 assert.equal(readFinderEnvelope(JSON.stringify({structured_output:{leads:[]}})),JSON.stringify({leads:[]}));
});
