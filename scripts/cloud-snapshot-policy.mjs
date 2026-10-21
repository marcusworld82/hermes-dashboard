export function pruneViews(responses,fresh){
 const out={...responses};
 for(const [index,prefix,field,idField] of [['/api/chat','/api/chat/','threads','id'],['/api/agents','/api/agents/','agents','id'],['/api/kanban','/api/kanban?board=','boards','slug']]){
  if(!fresh.has(index)||!Array.isArray(responses[index]?.[field]))continue;
  const ids=new Set(responses[index][field].map(row=>String(row[idField])));
  for(const key of Object.keys(out))if(key.startsWith(prefix)&&!ids.has(key.slice(prefix.length)))delete out[key];
 }
 return out;
}
