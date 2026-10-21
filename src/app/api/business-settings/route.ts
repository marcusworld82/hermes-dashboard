import {body,handle} from "@/lib/server/http";
import {getBusinessSettings,saveBusinessSettings,type BusinessSettings} from "@/lib/server/business-settings";
export async function GET(){return handle(()=>({settings:getBusinessSettings()}));}
export async function POST(req:Request){return handle(async()=>{
  const patch=await body<Partial<BusinessSettings>>(req),current=getBusinessSettings();
  if((patch.automaticMorningRun===true&&!current.automaticMorningRun)||(patch.senderEnabled===true&&!current.senderEnabled))throw Error("Use the morning run or sender activation control so setup and approval can be checked.");
  return {settings:saveBusinessSettings(patch)};
});}
