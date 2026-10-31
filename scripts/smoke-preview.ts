const raw=process.env.PREVIEW_ORIGIN;
if(!raw)throw new Error('Preview origin required');
const origin=new URL(raw);
const local=process.env.LOCAL_PREVIEW_FIXTURE_ENABLED==='true'&&process.env.NODE_ENV!=='production'&&origin.hostname==='127.0.0.1'&&origin.protocol==='http:';
if((!local&&(!/^[a-z][a-z0-9-]+\.fly\.dev$/.test(origin.hostname)||origin.protocol!=='https:'))||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Expected canonical assigned Fly HTTPS origin');
async function get(path:string,status=200){const response=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(15000)});if(response.status!==status)throw new Error(`Preview check failed: ${path} status`);return response;}
const health=await (await get('/api/health')).json();
if(health.service!=='LabTicker'||health.emailDeliveryMode!=='mock'||health.workerReady!==false)throw new Error('Preview runtime gate failed');
const home=await (await get('/')).text();
if(!home.includes('LabTicker')||!home.includes('catalog entries')||!home.includes('Ad-free'))throw new Error('Catalog unavailable');
if(/pagead2\.googlesyndication\.com|carbonads\.com|adsbygoogle/i.test(home))throw new Error('Advertising found');
const signin=await (await get('/auth/sign-in')).text();
if(!signin.includes('Public email sign-in is unavailable'))throw new Error('Preview sign-in gate failed');
await get('/auth/mock-inbox',404);
await get('/api/admin/analytics/summary',401);
console.log('Assigned-origin preview smoke passed: catalog, mock health, closed email auth, private fixture and aggregate gates');
