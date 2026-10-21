type Lead = {id:string;name:string;stage:string;doNotContact:boolean;email:string;drafts:{email:string}};
type Item = {leadId:string;status:string};
export function summarizeHomeLeads(leads:Lead[], items:Item[]) {
  const live = leads.filter(l => !l.doNotContact && !['Denied','Do not contact'].includes(l.stage));
  const waiting = new Set(items.filter(i => ['queued','sending','unknown','sent'].includes(i.status)).map(i => i.leadId));
  const drafts = live.filter(l => ['New','Ready to send'].includes(l.stage) && !!l.email && !!l.drafts.email.trim() && !waiting.has(l.id));
  return {readyToReview:drafts.length,needsContact:live.filter(l => ['New','Ready to send'].includes(l.stage) && !l.email).length,replies:live.filter(l=>l.stage==='Replied').map(({id,name})=>({id,name})),drafts:drafts.slice(0,8).map(({id,name})=>({id,name}))};
}
