async page => {
 const external=[];await page.context().route('**/*',async route=>{if(new URL(route.request().url()).origin==='http://127.0.0.1:3106')return route.continue();external.push(route.request().url());await route.abort();});
 await page.goto('http://127.0.0.1:3106/apps/jellyfin');
 const notes=page.locator('.release-markdown').first();await notes.getByRole('heading',{name:'Synthetic fixture changes'}).waitFor();
 if(await notes.locator('strong').textContent()!=='Updated'||await notes.locator('li').count()!==2||await notes.locator('pre code').textContent()!=='echo fixture\n'||await notes.locator('table').count()!==1)throw new Error('Markdown formatting failed');
 if(await notes.locator('img,script').count()||await page.evaluate(()=>window.markdownFixtureExecuted===true)||external.length)throw new Error('Untrusted upstream content executed or fetched');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
 return {accepted:true,headings:true,lists:true,code:true,tables:true,executedHtml:false,externalRequests:external.length,mobileOverflow:false};
}
