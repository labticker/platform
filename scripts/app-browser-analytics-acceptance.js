async page => {
 const origin='https://labticker-acceptance.invalid';
 const context=page.context(),requests=[],events=[],violations=[];
 await context.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){
   // No DNS/TLS request is made to the synthetic origin. Only this loopback container is contacted.
   const response=await route.fetch({url:`http://127.0.0.1:3103${url.pathname}${url.search}`});
   await route.fulfill({response});return;
  }
  requests.push({url:request.url(),referrer:request.headers().referer??'',method:request.method()});
  if(!/posthog\.com$/.test(url.hostname)||/\/s\/|record|replay|adsense|carbon/i.test(request.url()))violations.push('Unexpected replay/advertising/vendor request');
  if(/fixture-private|fixture(?:%40|@)example\.invalid/.test(request.url()+(request.headers().referer??'')))violations.push('Private URL/referrer enrichment');
  if(request.method()==='POST'){
   const bytes=request.postDataBuffer();
   if(bytes){
    let text=bytes.toString('utf8');
    if(url.searchParams.get('compression')==='gzip'||(bytes[0]===31&&bytes[1]===139))text=await page.evaluate(async raw=>new Response(new Blob([new Uint8Array(raw)]).stream().pipeThrough(new DecompressionStream('gzip'))).text(),Array.from(bytes));
    try{const data=JSON.parse(text);events.push(...(Array.isArray(data)?data:Array.isArray(data.batch)?data.batch:[data]));}catch{violations.push('Unrecognized SDK body');}
   }
  }
  // All vendor destinations are fulfilled locally, even if unexpected. Nothing reaches PostHog.
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:1,config:{},supportedCompression:[],featureFlags:{}})});
 });
 const waitFor=async predicate=>{for(let attempts=0;attempts<20;attempts++){if(predicate())return;await page.waitForTimeout(500);}throw new Error('Expected application analytics did not arrive');};
 await page.goto(`${origin}/?utm_source=reddit&utm_campaign=fixture-private&email=fixture@example.invalid&token=fixture-private`);
 await page.getByRole('searchbox',{name:'Find an application'}).waitFor();
 await waitFor(()=>events.some(e=>e.event==='$pageview'&&e.properties?.route==='/'));
 const search=page.getByRole('searchbox',{name:'Find an application'});
 await search.fill('fixture-private@example.invalid');
 await search.fill('fixture-private@example.invalid extra');
 await page.getByRole('combobox',{name:'Category'}).selectOption('media');
 await waitFor(()=>events.some(e=>e.event==='catalog_filter_used'));
 if(events.filter(e=>e.event==='catalog_search_used').length!==1)throw new Error('Search should emit one coarse event per nonempty interaction');
 if(!events.some(e=>e.event==='catalog_filter_used'))throw new Error('Catalog filter event missing');
 if(!events.some(e=>e.event==='$pageview'&&e.properties.acquisition==='community'))throw new Error('Coarse acquisition missing');
 if((await context.cookies()).length||await page.evaluate(()=>localStorage.length+sessionStorage.length))throw new Error('Enabled analytics created browser storage');
 await page.goto(`${origin}/privacy`);
 await page.getByRole('button',{name:'Disable optional analytics'}).waitFor();
 await waitFor(()=>events.some(e=>e.event==='$pageview'&&e.properties.route==='/privacy'));
 for(const event of events){
  if(!['$pageview','catalog_search_used','catalog_filter_used'].includes(event.event))throw new Error('Unexpected automatic event');
  const allowed=['route','token','distinct_id','$process_person_profile',...(event.event==='$pageview'&&event.properties.route==='/'?['acquisition']:[])];
  if(Object.keys(event.properties??{}).some(k=>!allowed.includes(k)))throw new Error('Unexpected identifying SDK enrichment');
  if(event.properties.distinct_id!=='$posthog_cookieless'||event.properties.$process_person_profile!==false)throw new Error('Person processing enabled');
  if(event.$set||event.$set_once||/fixture-private|fixture@example\.invalid|utm_campaign/.test(JSON.stringify(event)))throw new Error('Private event data escaped sanitizer');
 }
 const beforeOptout=requests.length;
 await page.getByRole('button',{name:'Disable optional analytics'}).click();
 await page.waitForLoadState('networkidle');await page.waitForTimeout(4000);
 const cookies=await context.cookies();
 if(cookies.length!==1||cookies[0].name!=='labticker_analytics'||cookies[0].value!=='off'||!cookies[0].secure)throw new Error('Only the secure essential opt-out preference cookie is permitted');
 await page.goto(origin+'/');await page.getByRole('searchbox',{name:'Find an application'}).fill('fixture-private');await page.waitForTimeout(4000);
 if(requests.length!==beforeOptout)throw new Error('Opt-out/reload did not stop vendor initialization and events');
 if(await page.evaluate(()=>localStorage.length+sessionStorage.length))throw new Error('Opt-out created analytics storage');
 await page.goto(origin+'/auth/sign-in');
 await page.getByText('Public email sign-in is unavailable',{exact:false}).waitFor();
 if(violations.length)throw new Error(violations.join('; '));
 await page.evaluate(result=>{window.applicationAnalyticsAcceptance=result;},{accepted:true,coarseSearchEvents:events.filter(e=>e.event==='catalog_search_used').length,coarseFilterEvents:events.filter(e=>e.event==='catalog_filter_used').length,pageviews:events.filter(e=>e.event==='$pageview').length,acquisition:'community',analyticsStorage:0,optout:'secure-preference-cookie-only; no further vendor calls',realIngestion:false});
}
