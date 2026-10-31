import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import Catalog from './catalog';
export default async function Page(){
 const directory=path.resolve(process.cwd(),'../../catalog/services');
 const services=await Promise.all((await readdir(directory)).filter(f=>f.endsWith('.json')).map(async file=>({...JSON.parse(await readFile(path.join(directory,file),'utf8')),provenance:`catalog/services/${file}`})));
 return <main><header><a href="/" className="brand">◷ LabTicker</a><span>Open source · Ad-free</span></header><section className="hero"><p className="eyebrow">LESS RESEARCH. MORE HOMELAB.</p><h1>Update your homelab.<br/><em>Without the homework.</em></h1><p>Choose your software once. Keep up with releases in one readable digest.</p><aside><strong>Product preview · mock email only</strong><p>Explore the catalog below. Public email sign-in and digests are unavailable until an owner-controlled sender domain is verified. Monitoring and account controls are still being built.</p></aside></section><Catalog services={services}/><footer>LabTicker is free and ad-free. Release information comes from upstream projects. Labels are advisory and do not establish compatibility or security.</footer></main>;
}
