async page => {
 const context=page.context();
 // SDK intentionally filters HeadlessChrome; emulate an ordinary browser UA solely
 // in this isolated fixture so its real capture path is exercised without changing app policy.
 await context.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}));
 const requests=[];const batches=[];
 await context.route('**/*',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(url.hostname==='127.0.0.1'&&url.port==='3102'){await route.continue();return;}
  requests.push({url:request.url(),method:request.method(),referrer:request.headers().referer??''});
  if(request.method()==='POST'){
   const raw=request.postDataBuffer();
   if(raw){
    let text=raw.toString('utf8');
    if(url.searchParams.get('compression')==='gzip'||(raw[0]===31&&raw[1]===139))text=await page.evaluate(async bytes=>new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))).text(),Array.from(raw));
    let decoded;try{decoded=JSON.parse(text);}catch{throw new Error('Unrecognized analytics transport encoding');}
    batches.push(...(Array.isArray(decoded)?decoded:Array.isArray(decoded.batch)?decoded.batch:[decoded]));
   }
  }
  // Every vendor destination is fulfilled locally, including remote config/replay/ad attempts.
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:1,config:{},supportedCompression:[],featureFlags:{}})});
 });
 await page.goto('http://127.0.0.1:3102/apps/immich?mode=enabled&utm_source=reddit&utm_campaign=fixture-private&email=fixture@example.invalid&token=fixture-private');
 await page.evaluate(()=>window.fixtureStart());
 await page.evaluate(()=>window.fixtureCapture());
 await page.waitForTimeout(5000);
 if(batches.length<2)throw new Error('Enabled SDK did not produce expected sanitized captures');
 for(const event of batches){
  if(event.event!=='$pageview')throw new Error('Unapproved event escaped sanitizer');
  const keys=Object.keys(event.properties).sort().join(',');
  if(keys!==['$process_person_profile','$geoip_disable','acquisition','distinct_id','route','token'].sort().join(','))throw new Error('Unexpected identifying SDK enrichment');
  if(event.properties.acquisition!=='community')throw new Error('Coarse acquisition category was not retained');
  if(event.properties.route!=='/apps/[slug]'||event.properties.token!=='phc_local_fixture_not_a_real_project'||event.properties.distinct_id!=='$posthog_cookieless'||(event.properties.$process_person_profile!==false||event.properties.$geoip_disable!==true))throw new Error('Incorrect cookieless capture envelope');
  if(event.$set||event.$set_once||JSON.stringify(event).includes('fixture-private')||JSON.stringify(event).includes('fixture@example.invalid'))throw new Error('Private data escaped sanitizer');
 }
 if(requests.some(r=>!/posthog\.com$/.test(new URL(r.url).hostname)||/\/s\/|record|replay|adsense|carbon/i.test(r.url)))throw new Error('Replay, advertising or unrelated vendor request attempted');
 if(requests.some(r=>/fixture-private|fixture(?:%40|@)example\.invalid/.test(r.url+r.referrer)))throw new Error('Private query/referrer leaked into vendor request');
 if((await context.cookies()).length)throw new Error('Analytics created cookies');
 if(await page.evaluate(()=>localStorage.length+sessionStorage.length))throw new Error('Analytics created persistent/session storage');
 const enabledRequests=requests.length;
 for(const mode of ['dnt','optout']){
  const next=await context.newPage();
  if(mode==='dnt')await next.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
  await next.goto(`http://127.0.0.1:3102/apps/immich?mode=${mode}`);
  await next.evaluate(()=>window.fixtureStart());
  await next.evaluate(()=>window.fixtureCapture());
  await next.waitForTimeout(800);
  if(requests.length!==enabledRequests)throw new Error('DNT/opt-out initialized SDK or sent a vendor request');
  if(await next.evaluate(()=>localStorage.length+sessionStorage.length))throw new Error('Disabled analytics wrote storage');
  await next.close();
 }
 if((await context.cookies()).length)throw new Error('Analytics scenarios created cookies');
 await page.evaluate(result=>{window.analyticsAcceptanceResult=result;},{accepted:true,sanitizedCaptures:batches.length,interceptedVendorRequests:requests.length,cookies:0,storage:0,dnt:'no-vendor-calls',optout:'no-vendor-calls',realIngestion:false});
 console.log(JSON.stringify({accepted:true,sanitizedCaptures:batches.length,interceptedVendorRequests:requests.length,cookies:0,storage:0,dnt:'no-vendor-calls',optout:'no-vendor-calls',realIngestion:false}));
}
