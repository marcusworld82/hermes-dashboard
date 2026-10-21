// Health only. This interval never dispatches automation or paid work.
export function startWorkerHeartbeat(beat, schedule=setInterval, cancel=clearInterval) {
 const timer=schedule(()=>{try{beat();}catch{console.error('Worker heartbeat could not be saved.');}},10000);
 timer.unref?.();
 return ()=>cancel(timer);
}
