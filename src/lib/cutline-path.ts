export function cutlinePath(parts:string[]) {
 const path=parts.join('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||/[\\%\x00]/.test(p)))return false;
 return /^api\/(fonts|projects|library|jobs|studio|auto|new|layouts|styles)$/.test(path)||/^api\/project\/[a-zA-Z0-9_-]{1,60}(?:\/(transcribe|scenes|faces|speakers|translate|srt|render|check))?$/.test(path)||/^projects\/[a-zA-Z0-9_-]{1,60}\/(?:render\.mp4|captions\.srt|assets\/(?:source\.mp4|thumb\.jpg))$/.test(path)||/^assets\/(?:whoosh\.mp3|whoosh-heavy\.mp3|click\.wav)$/.test(path);
}
