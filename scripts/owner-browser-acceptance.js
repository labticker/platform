async page => {
 const requests=[];await page.context().route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:3104'){await route.continue();}else{requests.push(url.origin);await route.abort();}});
 await page.goto('http://127.0.0.1:3104/apps');
 await page.getByText('Private owner acceptance',{exact:true}).waitFor();
 await page.getByRole('heading',{name:'Find your homelab.'}).waitFor();
 await page.goto('http://127.0.0.1:3104/auth/sign-in?error=AccessDenied');
 await page.getByText('This acceptance build is restricted to the project owner.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue with GitHub'}).waitFor();
 if(await page.getByLabel('Email address',{exact:true}).count())throw new Error('Email sign-in exposed');
 const results=await page.evaluate(async()=>{const get=async path=>{const response=await fetch(path,{redirect:'manual'});return {status:response.status,body:response.status===200?await response.json():null};};return {live:await get('/api/live'),health:await get('/api/health'),providers:await get('/api/auth/providers'),digests:await get('/api/digests'),report:await get('/api/admin/analytics/summary?from=2026-10-01&to=2026-10-02'),inbox:await get('/auth/mock-inbox')};});
 if(results.live.status!==200||results.health.body?.ownerAccessOnly!==true||results.health.body?.emailDeliveryMode!=='mock'||results.health.body?.analyticsEnabled!==false||Object.keys(results.providers.body??{}).join(',')!=='github'||results.digests.status!==401||results.report.status!==401||results.inbox.status!==404)throw new Error('Owner container boundary failed: '+JSON.stringify(results));
 if(requests.length)throw new Error('Unexpected third-party requests');
 return {accepted:true,ownerOnly:true,thirdPartyRequests:requests.length,privateDigest401:true,report401:true,mockInbox404:true,onlyGithubProvider:true};
}
