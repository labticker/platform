async page => {
 const origin='https://labticker.fly.dev',external=[];
 await page.context().route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(new URL(route.request().url()).hostname);await route.abort();});
 await page.setViewportSize({width:1440,height:1050});await page.goto(origin+'/apps/jellyfin');
 await page.locator('.release-card-header').first().waitFor();
 const notes=page.locator('.release-markdown');if(!await notes.count()||!await notes.locator('h4,ul,ol,pre,table,strong').count())throw new Error('Live Markdown structure missing');
 const dates=await page.locator('time.release-date').evaluateAll(nodes=>nodes.map(node=>Date.parse(node.getAttribute('datetime'))));
 if(dates.some((date,index)=>!Number.isFinite(date)||(index>0&&date>dates[index-1])))throw new Error('Live chronology is not newest first');
 const palette=await page.evaluate(()=>({scheme:getComputedStyle(document.documentElement).colorScheme,header:getComputedStyle(document.querySelector('.site-header')).backgroundColor,card:getComputedStyle(document.querySelector('.release-card')).backgroundColor,link:getComputedStyle(document.querySelector('.release-card .text-link')).color}));
 if(palette.scheme!=='light'||new Set([palette.header,palette.card,palette.link]).size!==3)throw new Error('Redesign not deployed');
 if(await notes.locator('img,script,iframe').count())throw new Error('Unsafe note element');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
 const health=await page.evaluate(async()=>await(await fetch('/api/health')).json());if(!health.workerReady||health.status!=='owner-acceptance'||health.emailDeliveryMode!=='mock'||health.analyticsEnabled)throw new Error('Rollout policy or worker not ready');
 if(external.length)throw new Error('Unexpected third-party request');
 return {accepted:true,origin,markdown:true,sortedReleases:dates.length,palette,mobileOverflow:false,thirdPartyRequests:external.length,workerReady:true};
}
