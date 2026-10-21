import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pruneViews} from './cloud-snapshot-policy.mjs';
import {authorizedBearer,safeApiPath,safeTunnel} from './cloud-security.mjs';
const file=process.env.HERMES_ACCESS_FILE||path.join(homedir(),'Library/Application Support/Hermes Dashboard/cloud-access.json');
const config=JSON.parse(readFileSync(file,'utf8'));
const port=Number(process.env.HERMES_BRIDGE_PORT||3202);
const local=process.env.HERMES_LOCAL_URL||'http://127.0.0.1:3200';
const known=new Set(['/api/overview','/api/social','/api/social/content','/api/agents','/api/pipeline','/api/kanban','/api/chat','/api/groups','/api/workflows','/api/settings','/api/skills','/api/connections','/api/connections/prospects','/api/home-brief','/api/today','/api/agent-activity','/api/leads','/api/clients','/api/lead-research','/api/outbox','/api/content-research','/api/composio/mcp/status']);
const cacheFile=path.join(path.dirname(file),'cloud-snapshot.json');
let responses={};try{if(existsSync(cacheFile))responses=JSON.parse(readFileSync(cacheFile,'utf8')).responses||{}}catch{}
let bridgeUrl='',registeredUrl='',lastHash='',syncing=false,stopping=false;
const server=http.createServer(async(req,res)=>{
 res.setHeader('x-hermes-relay','1');res.setHeader('Cache-Control','no-store');
 if(!authorizedBearer(req.headers.authorization,config.bridgeKey)){res.writeHead(401);res.end('Unauthorized');return}
 if(req.url==='/health'&&req.method==='GET'){try{const r=await fetch(local+'/social',{signal:AbortSignal.timeout(3000)});res.writeHead(r.ok?200:503);res.end(JSON.stringify({online:r.ok}));}catch{res.writeHead(503);res.end('Local dashboard offline')}return}
 if(!safeApiPath(req.url)||!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method)){res.writeHead(404);res.end('Unknown route');return}
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4_000_000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
  const headers={origin:local};if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];
  if(req.headers.range)headers.range=req.headers.range;
  const result=await fetch(local+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'error',signal:AbortSignal.timeout(265000)});
  const type=result.headers.get('content-type')||'application/json';const out={'Content-Type':type};
  for(const h of ['x-slide-flags','content-disposition','accept-ranges','content-range','content-length']){const v=result.headers.get(h);if(v)out[h]=v}
  res.writeHead(result.status,out);
  res.end(Buffer.from(await result.arrayBuffer()));
  // Only JSON views are synced to the cloud snapshot; slide images and ZIPs are fetched live.
  // Postiz and image routes call paid or rate-limited services, so they are never re-polled in the background.
  if(req.method==='GET'&&result.ok&&/json/.test(type)&&!/^\/api\/social\/(postiz|images|media)\//.test(req.url))known.add(req.url);
  if(req.method==='DELETE'&&result.ok){const key=req.url.split('?')[0];if(/^\/api\/(chat|agents|kanban)\/[\w-]+$/.test(key)){delete responses[key];known.delete(key)}}
  if(req.method!=='GET'&&result.ok&&!req.url.endsWith('/upload'))setTimeout(sync,1000).unref();
 }catch{if(!res.headersSent)res.writeHead(502);res.end(JSON.stringify({error:'Local request interrupted. Check the result before retrying.'}))}
});
async function register(){
 if(registeredUrl===bridgeUrl)return;
 try{const r=await fetch(config.url+'/api/sync',{method:'POST',headers:{authorization:'Bearer '+config.bridgeKey,'content-type':'application/json'},body:JSON.stringify({version:1,bridgeUrl,registerOnly:true}),signal:AbortSignal.timeout(30000),redirect:'error'});if(r.ok)registeredUrl=bridgeUrl;else console.error('Bridge registration HTTP',r.status)}catch{console.error('Bridge registration failed; snapshot sync will retry')}
}
async function sync(){
 if(syncing||!safeTunnel(bridgeUrl)||stopping)return;syncing=true;
 try{
  await register();
  const fresh=new Set();
  await Promise.all([...known].map(async p=>{try{const r=await fetch(local+p,{signal:AbortSignal.timeout(45000)});if(r.ok){responses[p]=await r.json();fresh.add(p)}}catch{}}));
  const before=new Set(Object.keys(responses));responses=pruneViews(responses,fresh);for(const key of before)if(!(key in responses))known.delete(key);
  const agents=responses['/api/agents']?.agents??[];for(const a of agents)if(/^[\w-]+$/.test(a.id))known.add('/api/agents/'+a.id);
  const threads=responses['/api/chat']?.threads??[];for(const t of threads.slice(0,30))if(/^[\w-]+$/.test(t.id))known.add('/api/chat/'+t.id);
  const boards=responses['/api/kanban']?.boards??[];for(const b of boards)if(/^[\w-]+$/.test(b.slug))known.add('/api/kanban?board='+b.slug);
  const data={version:1,bridgeUrl,responses};const raw=JSON.stringify(data);
  if(Buffer.byteLength(raw)>3_900_000)throw Error('Cloud snapshot exceeds size limit');
  const hash=createHash('sha256').update(raw).digest('hex');if(hash===lastHash)return;
  const result=await fetch(config.url+'/api/sync',{method:'POST',headers:{authorization:'Bearer '+config.bridgeKey,'content-type':'application/json'},body:raw,signal:AbortSignal.timeout(60000),redirect:'error'});
  if(!result.ok)throw Error('Cloud sync HTTP '+result.status);
  lastHash=hash;writeFileSync(cacheFile,JSON.stringify({...data,syncedAt:new Date().toISOString()}),{mode:0o600});
  console.log(new Date().toISOString(),'Cloud sync saved',Object.keys(responses).length,'views');
 }catch(e){console.error(new Date().toISOString(),String(e.message).slice(0,120))}finally{syncing=false}
}
// Cloudflare quick tunnels can lose their public address while cloudflared keeps running.
// Every few minutes, call our own public /health. Any answer from this relay means the tunnel is alive,
// even if the local dashboard is down. Two failures in a row (no DNS, no connection, or a Cloudflare error page)
// stop the relay so launchd starts it again with a fresh tunnel, which registers its new address.
let tunnelMisses=0;
async function checkTunnel(){
 if(!safeTunnel(bridgeUrl)||stopping)return;
 let alive=false;
 try{const r=await fetch(bridgeUrl+'/health',{headers:{authorization:'Bearer '+config.bridgeKey},signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});alive=r.headers.get('x-hermes-relay')==='1';await r.arrayBuffer().catch(()=>{})}catch{}
 if(alive){tunnelMisses=0;return}
 tunnelMisses++;console.error(new Date().toISOString(),'Tunnel self-check failed',tunnelMisses,'of 2');
 if(tunnelMisses>=2){console.error('Tunnel address is dead; restarting for a fresh one.');stop()}
}
const tunnelTimer=setInterval(checkTunnel,Number(process.env.HERMES_TUNNEL_CHECK_MS||180000));tunnelTimer.unref();
let tunnel;
function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(tunnelTimer);tunnel?.kill('SIGTERM');server.close();setTimeout(()=>process.exit(0),500).unref()}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
server.listen(port,'127.0.0.1',()=>{
 console.log('Hermes private relay listening on loopback port',port);
 if(process.env.HERMES_TEST_NO_TUNNEL==='1')return;
 tunnel=spawn('/opt/homebrew/bin/cloudflared',['tunnel','--url',`http://127.0.0.1:${port}`,'--no-autoupdate'],{stdio:['ignore','ignore','pipe']});
 let text='';tunnel.stderr.on('data',chunk=>{text=(text+chunk).slice(-16000);const url=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(url&&safeTunnel(url)&&bridgeUrl!==url){bridgeUrl=url;console.log('Private tunnel connected. Registering cloud endpoint.');sync()}});
 tunnel.on('exit',()=>{if(!stopping){console.error('Tunnel stopped; supervisor will restart.');stop()}});tunnel.on('error',()=>stop());
});
server.on('error',()=>{console.error('Relay could not start');process.exit(1)});
const timer=setInterval(sync,120000);
