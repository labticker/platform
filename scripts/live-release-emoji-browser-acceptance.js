async page => {
 const origin='https://labticker.fly.dev',external=[];
 await page.context().route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(new URL(route.request().url()).hostname);await route.abort();});
 await page.goto(origin+'/apps/jellyfin');await page.locator('.release-markdown h4').first().waitFor();
 const headings=await page.locator('.release-markdown h4').allTextContents();
 const rocketHeadings=headings.filter(text=>text.includes('🚀')).length;
 if(!rocketHeadings||headings.some(text=>text.includes(':rocket:')))throw new Error('Live GitHub shortcode conversion missing');
 if(await page.locator('.release-markdown img,.release-markdown script,.release-markdown iframe').count()||external.length)throw new Error('Unexpected upstream HTML or external request');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
 const health=await page.evaluate(async()=>await(await fetch('/api/health')).json());if(!health.workerReady||health.status!=='owner-acceptance'||health.emailDeliveryMode!=='mock'||health.analyticsEnabled)throw new Error('Worker or rollout policy not ready');
 return {accepted:true,origin,unicodeRocketHeadings:rocketHeadings,literalRocketHeadings:0,mobileOverflow:false,thirdPartyRequests:external.length,workerReady:true};
}
