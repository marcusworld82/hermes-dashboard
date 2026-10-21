// Read only this simple Hermes CLI-owned YAML list. Never expose the full config.
export function disabledSkills(config:string):string[]{
  const block=config.match(/^skills:\s*\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1]??"";
  const inline=block.match(/^  disabled:\s*(\[[^\n]*\])/m)?.[1];
  if(inline){try{const value=JSON.parse(inline);return Array.isArray(value)?value.filter(v=>typeof v==="string"):[];}catch{return [];}}
  const list=block.match(/^  disabled:\s*\n((?: {2,}-[^\n]*\n?)*)/m)?.[1]??"";
  return [...list.matchAll(/^\s+-\s+['"]?([a-z0-9_-]+)['"]?\s*$/gm)].map(m=>m[1]);
}
