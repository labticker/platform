// A process scaffold only. Durable database-backed catalog/release/digest jobs remain pending.
console.log(JSON.stringify({service:'labticker-worker',status:'scaffold',emailDeliveryMode:'mock',publicEmailEnabled:false}));
if(process.env.WORKER_ENABLED==='true') throw new Error('Worker jobs are not implemented; refusing to report a healthy scheduler');
