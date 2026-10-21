'use client';
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {api,useApi} from '@/lib/client';
import {Button,Card,ErrorNote,Page,PageHeader} from '@/components/ui';
type MailStatus={block:string|null;connected:boolean;email:string|null;scheduler:string;pollError?:string|null;test:{sent:boolean;verifiedAt:number|null;error:string|null}|null};
type McpStatus={connected:boolean;needsLogin:boolean;toolsVerified:boolean;lastCheckedAt?:number;error?:string};
type GmailCheck={active:boolean;accounts:{id:string;email:string|null;alias:string|null}[];checkedAt:number;url?:string};
export default function GmailSettings(){return <Suspense fallback={<Page><PageHeader title="Gmail and Composio" sub="Loading connection settings."/></Page>}><GmailSettingsInner/></Suspense>;}
function GmailSettingsInner(){
 const params=useSearchParams();
 const callbackError=params.get("composio")==="error"?"Composio sign-in was not completed. Try connecting again.":null;
 const mail=useApi<MailStatus>('/api/gmail');
 const mcp=useApi<McpStatus>('/api/composio/mcp/status');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[gmail,setGmail]=useState<GmailCheck|null>(null);
 async function connect(){
  setBusy(true);setMessage(null);
  try{const result=await api<{url:string}>('/api/composio/mcp/connect',{method:'POST',json:{}});window.location.assign(result.url);}
  catch(e){setMessage((e as Error).message);setBusy(false);}
 }
 async function checkGmail(connectMissing=false){
  setBusy(true);setMessage(null);
  try{const result=await api<GmailCheck>('/api/composio/mcp/gmail',{method:'POST',json:{connectMissing}});setGmail(result);}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function mailAction(name:string){
  setBusy(true);setMessage(null);
  try{const result=await api<{sentTo?:string;verified?:boolean}>(`/api/gmail/${name}`,{method:'POST',json:{}});setMessage(result.sentTo?`Test sent only to ${result.sentTo}. Verify it after it arrives.`:result.verified?'Test verified in your Gmail inbox.':'Inbox check completed.');await mail.reload();}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <Page>
  <PageHeader title="Gmail and Composio" sub="Sign in to Composio to connect its MCP tools to Marcus OS."/>
  <ErrorNote text={mcp.error||mcp.data?.error||message||callbackError||null}/>
  <Card className="p-5 space-y-4">
   <h2 className="text-lg font-semibold">Composio MCP</h2>
   <p>{mcp.data?.connected&&mcp.data.toolsVerified?'Connected to Composio. MCP tools verified.':'Sign in to your Composio account to connect Marcus OS.'}</p>
   <Button disabled={busy} onClick={()=>void connect()}>{busy?'Working…':mcp.data?.connected?'Reconnect Composio':'Connect Composio'}</Button>
   <p className="text-sm text-gray-600">This opens Composio’s login and permission screen. No API key or Google Cloud setup is needed.</p>
   {mcp.data?.lastCheckedAt&&<p className="text-sm text-gray-600">Last checked {new Date(mcp.data.lastCheckedAt).toLocaleString()}.</p>}
  </Card>
  <Card className="p-5 mt-4 space-y-4">
   <h2 className="text-lg font-semibold">Gmail in Composio</h2>
   <p>After signing in, check the Gmail accounts available through your Composio connection.</p>
   <Button variant="light" disabled={busy||!mcp.data?.connected} onClick={()=>void checkGmail()}>Check Gmail connection</Button>
   {gmail&&<>
    <p>{gmail.active?'Composio reports these Gmail connections as active:':'No active Gmail connection was found in Composio.'}</p>
    {gmail.accounts.map(account=><p key={account.id} className="text-sm">{account.email||account.alias||'Gmail account'}{!account.email&&' (email not supplied by Composio)'}</p>)}
    {!gmail.active&&!gmail.url&&<Button disabled={busy} onClick={()=>void checkGmail(true)}>Connect Gmail in Composio</Button>}
    {gmail.url&&<a href={gmail.url} target="_blank" rel="noreferrer" className="underline">Sign in to Gmail through Composio, then return here and check again</a>}
   </>}
   <p className="text-sm text-gray-600">Connecting the MCP does not approve emails or enable the sending queue.</p>
  </Card>
  <Card className="p-5 mt-4 space-y-4">
   <h2 className="text-lg font-semibold">Email queue</h2>
   <p>{mail.data?.connected?`Queue mailbox: ${mail.data.email}`:'The email queue has no verified sending mailbox yet.'}</p>
   {!mail.data?.connected&&<p className="text-sm">Composio MCP login and tool access are available above. Queue sending through MCP still needs its transport checks before emails can be released.</p>}
   {mail.data?.connected&&<div className="flex flex-wrap gap-2">
    <Button variant="light" disabled={busy||!!mail.data.block} onClick={()=>void mailAction('test')}>Send test to myself</Button>
    <Button variant="light" disabled={busy||!mail.data.test?.sent} onClick={()=>void mailAction('verify')}>Verify test in inbox</Button>
    <Button variant="light" disabled={busy} onClick={()=>void mailAction('poll')}>Check replies and bounces</Button>
   </div>}
   {mail.data?.test?.verifiedAt&&<p className="text-sm">Test verified {new Date(mail.data.test.verifiedAt).toLocaleString()}.</p>}
   <p className="text-sm text-gray-600">Your Mac must stay on for local scheduled work. An always-on worker is still needed for Mac-off delivery.</p>
   <Link href="/outbox" className="underline text-sm">Open Outbox</Link>
  </Card>
 </Page>;
}
