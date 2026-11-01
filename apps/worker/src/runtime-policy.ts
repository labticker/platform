/** Production bursts allow Neon Free compute to autosuspend between ticks. */
export function workerTickInterval(env:Record<string,string|undefined>):number{
 const raw=env.WORKER_TICK_INTERVAL_MS;
 if(raw===undefined)return env.NODE_ENV==='production'?900000:60000;
 if(!/^\d+$/.test(raw))throw new Error('Invalid worker tick interval');
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value<60000||value>900000)throw new Error('Invalid worker tick interval');
 return value;
}
