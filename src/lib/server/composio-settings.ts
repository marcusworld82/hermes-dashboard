import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {paths} from './paths.ts';
import {encryptGmailSecret,decryptGmailSecret} from './gmail-crypto.ts';
type Saved = {encryptedApiKey:string;authConfigId:string};
const settingsFile=()=>path.join(paths.data,'composio-settings.json');
export function getComposioSettings(file=settingsFile()) {
 let saved:Saved|undefined;
 if(fs.existsSync(file)) saved=JSON.parse(fs.readFileSync(file,'utf8')) as Saved;
 const apiKey=process.env.COMPOSIO_API_KEY || (saved?.encryptedApiKey ? decryptGmailSecret<string>(saved.encryptedApiKey):'');
 return {apiKey,authConfigId:process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID || saved?.authConfigId || '',userId:process.env.COMPOSIO_USER_ID || 'marcus-os',callbackUrl:process.env.COMPOSIO_CALLBACK_URL || 'http://localhost:3200/api/gmail/composio/callback'};
}
export function composioSettingsStatus(file=settingsFile()) {
 const config=getComposioSettings(file);
 const missing=[...(!config.apiKey?['COMPOSIO_API_KEY']:[]),...(!config.authConfigId?['COMPOSIO_GMAIL_AUTH_CONFIG_ID']:[])];
 return {configured:missing.length===0,apiKeySet:!!config.apiKey,authConfigId:config.authConfigId,userId:config.userId,callbackUrl:config.callbackUrl,missing};
}
export async function saveComposioSettings(input:{apiKey?:string;authConfigId?:string},fetcher:typeof fetch=fetch,file=settingsFile()) {
 if(!input || typeof input!=='object' || Object.keys(input).some(k=>!['apiKey','authConfigId'].includes(k))) throw Error('Invalid Composio settings.');
 for(const value of Object.values(input)) if(typeof value!=='string' || value.length>4096 || /[\r\n]/.test(value)) throw Error('Invalid Composio settings.');
 const current=getComposioSettings(file);
 if(process.env.COMPOSIO_API_KEY && input.apiKey?.trim() && input.apiKey.trim()!==process.env.COMPOSIO_API_KEY) throw Error('This server uses an environment-managed Composio key. Update that key privately on the server.');
 const apiKey=input.apiKey?.trim() || current.apiKey;
 if(!apiKey)throw Error('Enter your Composio project API key.');
 const encryptedApiKey=encryptGmailSecret(apiKey);
 // Explicit save prepares a managed Gmail auth config. No mailbox is connected here.
 let authConfigId=input.authConfigId?.trim() || (input.apiKey?.trim() && input.apiKey.trim()!==current.apiKey ? '' : current.authConfigId);
 if(!authConfigId){
  const response=await fetcher('https://backend.composio.dev/api/v3/auth_configs',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey},body:JSON.stringify({toolkit:{slug:'gmail'},auth_config:{type:'use_composio_managed_auth',credentials:{scopes:'https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly'}}}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok) throw Error(`Composio setup failed (HTTP ${response.status}). Check your project API key and auth-config permissions.`);
  const result=await response.json();authConfigId=result.auth_config?.id;
  if(typeof authConfigId!=='string' || !/^ac_[a-zA-Z0-9_-]+$/.test(authConfigId))throw Error('Composio returned no Gmail auth configuration. Check the Composio dashboard before retrying.');
 }
 if(!/^ac_[a-zA-Z0-9_-]+$/.test(authConfigId)) throw Error('Enter a valid Composio auth config ID.');
 const saved:Saved={encryptedApiKey,authConfigId};
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(saved),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return composioSettingsStatus(file);
}
