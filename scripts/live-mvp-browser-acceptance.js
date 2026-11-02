async page => {
 const origin='https://labticker.fly.dev',external=[];
 await page.context().route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(new URL(route.request().url()).hostname);await route.abort();});
 const response=await page.goto(origin+'/apps');if(response?.status()!==200)throw new Error('Live catalog unavailable');
 await page.getByText('Private owner acceptance',{exact:true}).waitFor();
 const search=page.getByRole('searchbox',{name:'Find an application'});await search.fill('Jellyfin');await page.getByText('1 application matching your search',{exact:true}).waitFor();
 if(await page.locator('article').count()!==1)throw new Error('Catalog search failed');
 await page.goto(origin+'/apps/jellyfin');await page.getByRole('heading',{name:'Jellyfin',exact:true}).waitFor();await page.getByRole('heading',{name:'Stable releases',exact:true}).waitFor();
 if(await page.getByText('No release history yet.',{exact:true}).count())throw new Error('Release baseline missing');
 await page.goto(origin+'/auth/sign-in');await page.getByRole('button',{name:'Continue with GitHub'}).waitFor();if(await page.getByLabel('Email address',{exact:true}).count())throw new Error('Email enabled');
 const checks=await page.evaluate(async()=>{const get=async path=>{const response=await fetch(path,{redirect:'manual'});return {status:response.status,body:response.ok?await response.json():null};};return {health:await get('/api/health'),providers:await get('/api/auth/providers'),digests:await get('/api/digests'),report:await get('/api/admin/analytics/summary?from=2026-10-01&to=2026-10-02'),inbox:await get('/auth/mock-inbox'),storage:localStorage.length+sessionStorage.length};});
 if(checks.health.body?.status!=='owner-acceptance'||checks.health.body?.workerReady!==true||checks.health.body?.analyticsEnabled!==false||checks.health.body?.emailDeliveryMode!=='mock'||Object.keys(checks.providers.body??{}).join(',')!=='github'||checks.digests.status!==401||checks.report.status!==401||checks.inbox.status!==404||checks.storage!==0||external.length)throw new Error('Live acceptance failed: '+JSON.stringify(checks));
 return {accepted:true,origin,releaseHistory:true,githubProvider:true,ownerOnly:true,mockEmail:true,workerReady:true,thirdPartyRequests:external.length,analyticsStorage:checks.storage,ownerOAuthRoundTripRequired:true};
}
