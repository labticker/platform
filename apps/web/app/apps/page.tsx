import Catalog from '../catalog';
import {SiteHeader,SiteFooter} from '../site-chrome';
import {getCurrentUser} from '../../lib/auth';
import {catalogForAccount} from '../../lib/catalog-data';
export const dynamic='force-dynamic';
export default async function Applications(){
 const user=await getCurrentUser();const catalog=await catalogForAccount(user?.id);
 return <main><SiteHeader signedIn={!!user}/><div className="page-heading"><p className="eyebrow">BUILD YOUR UPDATE LIST</p><h1>Find your homelab.</h1><p>Stable releases, official sources, and a clear view of what we can track.</p></div>{catalog.mode!=='database'&&<div className="notice"><strong>{catalog.mode==='unavailable'?'Live tracking status is temporarily unavailable.':'Reviewed catalog preview'}</strong><p>Definitions are available from Git. Monitoring becomes available after the catalog is synchronized.</p></div>}<Catalog services={catalog.entries} signedIn={!!user}/><SiteFooter/></main>;
}
