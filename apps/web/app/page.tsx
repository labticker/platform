import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import Catalog from './catalog';
import {githubOAuthAllowed} from '../lib/auth-policy';
export const dynamic='force-dynamic';
export default async function Page(){
 const directory=path.resolve(process.cwd(),'../../catalog/services');
 const services=await Promise.all((await readdir(directory)).filter(f=>f.endsWith('.json')).map(async file=>({...JSON.parse(await readFile(path.join(directory,file),'utf8')),provenance:`catalog/services/${file}`})));
 const pilot=githubOAuthAllowed(process.env);
 return <main><header><a href="/" className="brand">◷ LabTicker</a><span>Open source · Ad-free</span>{pilot&&<a href="/dashboard">Your monitors</a>}</header><section className="hero"><p className="eyebrow">LESS RESEARCH. MORE HOMELAB.</p><h1>Update your homelab.<br/><em>Without the homework.</em></h1><p>Choose your software once. Keep up with releases in one readable digest.</p><aside><strong>{pilot?'GitHub sign-in pilot · mock email only':'Product preview · mock email only'}</strong>{pilot?<p>Save monitors and preferences with GitHub. Digests are simulated and no email is sent. <a href="/auth/sign-in">Continue with GitHub</a></p>:<p>Explore the catalog below. Public email sign-in and digests are unavailable until an owner-controlled sender domain is verified. Account enrollment is not enabled in this preview.</p>}</aside></section><Catalog services={services}/><footer>LabTicker is free and ad-free. Release information comes from upstream projects. Labels are advisory and do not establish compatibility or security.</footer></main>;
}
