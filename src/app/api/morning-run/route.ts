import { approveMorningTelegram, morningTelegramStatus } from '@/lib/server/morning-brief-telegram';
import { openMorningStore } from '@/lib/server/morning-store';
import { approveMorningModels, morningModelConsent } from '@/lib/server/morning-model';
import { runManualMorningStep } from '@/lib/server/morning-runtime';
import { approveTelegramAlerts } from '@/lib/server/morning-telegram';
import { body, handle } from '@/lib/server/http';
import { activateMorning, activateSender, morningStatus } from '@/lib/server/morning-run';
export async function GET() { return handle(() => {const store=openMorningStore();try{return {...morningStatus(),modelConsent:morningModelConsent(),morningTelegram:morningTelegramStatus(store)};}finally{store.close();}}); }
export async function POST(req: Request) { return handle(async () => {
  const input = await body<{ target?: string; step?:string; approveModelCall?:boolean; approvedCalls?:number; enabled?: boolean; approvedCapUsd?: number; approveDailySpend?: boolean; approvedDailyLimit?: number; approveApprovedEmailRelease?: boolean; approvedDestination?: string }>(req);
  if(input.target==='step'){if(['rico-drafts','content-research','quinn-review'].includes(input.step||'')&&input.approveModelCall!==true)throw Error('Approve the model call first.');return runManualMorningStep(input.step||'');}
  if(input.target==='morning-telegram'){if(typeof input.enabled!=='boolean')throw Error('Choose on or off.');return {morningTelegram:approveMorningTelegram(input.enabled,input.approvedDestination)};}
  if(input.target==='models')return {modelConsent:approveMorningModels(input.enabled===true,input.approvedCalls)};
  if (typeof input.enabled !== 'boolean') throw Error('Choose on or off.');
  if (input.target === 'morning') return { settings: await activateMorning({ ...input, enabled: input.enabled }) };
  if (input.target === 'telegram') return { telegram: approveTelegramAlerts(input.enabled, input.approvedDestination) };
  if (input.target === 'sender') return { settings: activateSender({ ...input, enabled: input.enabled }) };
  throw Error('Choose the morning run or email sender.');
}); }
