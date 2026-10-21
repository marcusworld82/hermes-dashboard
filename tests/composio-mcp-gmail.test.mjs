import test from 'node:test';
import assert from 'node:assert/strict';
import {checkComposioMcpGmail} from '../src/lib/server/composio-mcp-gmail.ts';
const wrap=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
test('MCP Gmail check returns only connection metadata and never invokes a Gmail action',async()=>{
 const calls=[];const result=await checkComposioMcpGmail(false,async(name,args)=>{calls.push({name,args});return wrap({successful:true,data:{toolkit_connection_statuses:[{toolkit:'gmail',has_active_connection:true,accounts:[{id:'gmail_one',status:'ACTIVE',user_info:{email:'self@example.com'},alias:'work'},{id:'gmail_old',status:'EXPIRED'}]}]}});});
 assert.equal(result.active,true);assert.equal(result.accounts.length,1);assert.equal(result.accounts[0].email,'self@example.com');assert.deepEqual(calls.map(c=>c.name),['COMPOSIO_SEARCH_TOOLS']);
});
test('MCP Gmail starts authorization only after explicit request, rejects foreign login host',async()=>{
 let writes=0;const runner=async name=>name==='COMPOSIO_SEARCH_TOOLS'?wrap({data:{toolkit_connection_statuses:[{toolkit:'gmail',has_active_connection:false,accounts:[]}],session:{id:'session-one'}}}):(writes++,wrap({data:{redirect_url:'https://evil.example/authorize'}}));
 assert.equal((await checkComposioMcpGmail(false,runner)).active,false);assert.equal(writes,0);
 await assert.rejects(checkComposioMcpGmail(true,runner),/valid Composio sign-in link/);assert.equal(writes,1);
});
test('MCP Gmail fails closed on tool errors or incomplete status',async()=>{
 await assert.rejects(checkComposioMcpGmail(false,async()=>({isError:true,content:[{type:'text',text:'private provider error'}]})),/connection check failed/);
 await assert.rejects(checkComposioMcpGmail(false,async()=>wrap({data:{}})),/did not return Gmail connection status/);
});
