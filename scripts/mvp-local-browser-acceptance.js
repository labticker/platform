async page => {
 page.setDefaultNavigationTimeout(60000);page.setDefaultTimeout(30000);
 const origin='http://127.0.0.1:3100',external=[];
 await page.context().route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(new URL(route.request().url()).hostname);await route.abort();});
 await page.goto(origin+'/auth/sign-in');
 await page.getByLabel('Test email').fill('mvp-fixture@example.invalid');
 await page.getByRole('button',{name:'Request test sign-in link'}).click();
 await page.waitForURL('**/api/auth/verify-request**');
 const html=await (await page.request.get(origin+'/auth/mock-inbox')).text();
 const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1].replaceAll('&amp;','&'));
 const link=hrefs.filter(href=>href.startsWith(origin+'/api/auth/callback/mock-email')).at(-1);
 if(!link)throw new Error('Local fixture sign-in link unavailable');
 try{await page.goto(link);}catch{throw new Error('Fixture verification failed');}
 await page.getByRole('heading',{level:1,name:'Your homelab monitors'}).waitFor();
 await page.goto(origin+'/apps');
 for(const name of ['Home Assistant','Immich','Jellyfin']){
  const card=page.locator('article').filter({has:page.getByRole('heading',{level:3,name:new RegExp(name)})});
  await card.getByRole('button',{name:'+ Monitor',exact:true}).click();
  await card.getByRole('button',{name:'✓ Monitoring',exact:true}).waitFor();
 }
 await page.getByLabel('Monitored only').check();
 if(await page.locator('article').count()!==3)throw new Error('Three monitors did not persist');
 await page.goto(origin+'/settings');
 await page.getByLabel('Frequency').selectOption('daily');
 await page.getByLabel('IANA timezone').fill('America/Winnipeg');
 await page.getByLabel('Enable digest schedule').check();
 await page.getByLabel(/I expressly consent/).check();
 await page.getByRole('button',{name:'Save preferences'}).click();
 await page.waitForTimeout(500);await page.reload();
 if(await page.getByLabel('Frequency').inputValue()!=='daily'||await page.getByLabel('IANA timezone').inputValue()!=='America/Winnipeg'||!await page.getByLabel('Enable digest schedule').isChecked())throw new Error('Cadence/timezone/consent did not persist');
 const response=await page.request.get(origin+'/api/digests');if(response.status()!==200)throw new Error('Private digest read model unavailable');
 const digests=await response.json();
 if(digests.sample.length!==3||digests.upcoming.length!==0||!digests.eligibleToSchedule)throw new Error('Baseline sample/upcoming/consent boundary failed');
 await page.goto(origin+'/digests?view=sample');await page.getByRole('heading',{level:2,name:'Sample digest'}).waitFor();
 if(await page.locator('article').count()!==3)throw new Error('Selected-app digest sample missing');
 await page.goto(origin+'/apps/jellyfin');await page.getByRole('heading',{level:1,name:'Jellyfin'}).waitFor();
 await page.getByText('Synthetic local acceptance release',{exact:true}).waitFor();
 await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Access denied'}).waitFor();
 const report=await page.request.get(origin+'/api/admin/analytics/summary');if(report.status()!==401)throw new Error('Aggregate endpoint exposed without service authorization');
 await page.goto(origin+'/dashboard');await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error('Mobile dashboard overflows');
 if(external.length)throw new Error('Unexpected third-party request');
 await page.evaluate(result=>{window.mvpLocalAcceptance=result;},{accepted:true,monitors:3,frequency:'daily',timezone:'America/Winnipeg',sampleReleases:3,baselineQueued:0,adminDenied:true,aggregateUnauthorized:401,mobileOverflow:false,thirdPartyRequests:0,realEmailSent:false});
}
