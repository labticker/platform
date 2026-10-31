import {createServer} from 'node:http';
import {build} from 'esbuild';
if(process.env.LOCAL_ANALYTICS_FIXTURE_ENABLED!=='true'||process.env.NODE_ENV==='production')throw new Error('Explicit local analytics fixture opt-in required');
const result=await build({stdin:{contents:`
 import {createAnalytics,safeAcquisition} from './packages/analytics/src/index.ts';
 import {posthog} from './packages/analytics/node_modules/posthog-js';
 const mode=new URLSearchParams(location.search).get('mode');
 window.fixtureStart=async()=>{
  const acquisition=safeAcquisition(location.href,document.referrer);
  const adapter=await createAnalytics({provider:'posthog',production:true,key:'phc_local_fixture_not_a_real_project',host:'https://us.i.posthog.com',doNotTrack:navigator.doNotTrack==='1',optedOut:mode==='optout',acquisition});
  window.fixtureCapture=()=>{
   adapter.capture('$pageview','/apps/immich?email=fixture@example.invalid&token=fixture-private');
   adapter.capture('$pageview','/auth/callback?token=fixture-private');
   if(mode==='enabled')posthog.capture('$pageview',{route:'/apps/[slug]',acquisition,email:'fixture@example.invalid',$current_url:location.href,$referrer:'https://private.invalid/user',$set:{email:'fixture@example.invalid'},$set_once:{account:'fixture-private'}});
   if(mode==='enabled')posthog.capture('unapproved_event',{email:'fixture@example.invalid'});
  };
 };`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',platform:'browser',write:false,define:{'process.env.NODE_ENV':'"production"'}});
const bundle=result.outputFiles?.[0]?.contents;if(!bundle)throw new Error('Fixture bundle unavailable');
const server=createServer((request,response)=>{
 if(request.url?.split('?')[0]==='/fixture.js'){response.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});response.end(bundle);return;}
 response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
 response.end('<!doctype html><html><head><title>Local analytics acceptance</title></head><body><h1>Local analytics acceptance fixture</h1><script src="/fixture.js"></script></body></html>');
});
server.listen(3102,'127.0.0.1',()=>console.log('Local analytics fixture listening on loopback port 3102; intercept all external requests before opening'));
process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
