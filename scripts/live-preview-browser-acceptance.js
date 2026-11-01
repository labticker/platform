async page => {
 const origin='https://labticker.fly.dev',external=[];
 await page.context().route('**/*',async route=>{
  if(new URL(route.request().url()).origin===origin)return route.continue();
  external.push(new URL(route.request().url()).hostname);
  await route.abort();
 });
 const response=await page.goto(origin+'/');
 if(response?.status()!==200)throw new Error('Public origin unavailable');
 await page.getByRole('searchbox',{name:'Find an application'}).waitFor();
 await page.getByText('50 catalog entries',{exact:true}).waitFor();
 await page.getByRole('searchbox',{name:'Find an application'}).fill('Jellyfin');
 if(await page.locator('article').count()!==1)throw new Error('Live catalog search failed');
 await page.getByRole('link',{name:'Jellyfin ↗'}).waitFor();
 await page.waitForTimeout(5000);
 if(external.length)throw new Error('Unexpected third-party request in no-op preview');
 if((await page.context().cookies()).length||await page.evaluate(()=>localStorage.length+sessionStorage.length))throw new Error('Unexpected preview browser storage');
 await page.goto(origin+'/auth/sign-in');
 await page.getByText('Public email sign-in is unavailable',{exact:false}).waitFor();
 if(await page.getByRole('button',{name:'Continue with GitHub'}).count())throw new Error('Pilot enrolled users before acceptance');
 await page.evaluate(result=>{window.livePreviewAcceptance=result;},{accepted:true,origin,catalogEntries:50,search:'passed',thirdPartyRequests:external.length,analyticsStorage:0,publicSignin:false});
}
