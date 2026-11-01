import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getDatabase} from '@labticker/database/runtime';
import {readPublicApplication} from '@labticker/database/public-catalog';
import {accountDashboard} from '@labticker/database/accounts';
import {getCurrentUser} from '../../../lib/auth';
import {publicCatalog} from '../../../lib/catalog-data';
import {guardAccount} from '../../../lib/account-errors';
import {SiteHeader,SiteFooter} from '../../site-chrome';
import {SourceStatus,dateLabel,externalUrl} from '../../source-status';
import {MonitorButton} from '../../monitor-button';
import {toggleMonitor} from '../../dashboard/actions';
import {ReleaseNotes} from '../../release-notes';
import {WebsiteAdSlot} from '../../website-ad-slot';
export const dynamic='force-dynamic';
export default async function Application({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)notFound();
 const user=await getCurrentUser();const catalog=await publicCatalog();
 const details=process.env.WEB_DATABASE_URL||process.env.DATABASE_URL?await readPublicApplication(getDatabase(),slug).catch(()=>null):null;
 if(details&&details.app.slug!==slug)redirect(`/apps/${details.app.slug}`);
 const app=details?.app??catalog.entries.find(app=>app.slug===slug);if(!app)notFound();
 const state=user?await guardAccount(()=>accountDashboard(getDatabase(),user.id)):null;
 const active=state?.monitors.some(monitor=>monitor.applicationId===app.id&&monitor.active)??false;
 return <main><SiteHeader signedIn={!!user}/><Link href="/apps" className="breadcrumb">← All applications</Link><section className="app-detail-heading"><div><p className="eyebrow">{app.category}</p><h1>{app.name}</h1><p className="lead">{app.summary}</p><SourceStatus state={app.sourceState} limited={app.historyLimited}/></div><div className="app-detail-actions">{user&&app.id?<form action={toggleMonitor}><input type="hidden" name="applicationId" value={app.id}/><input type="hidden" name="active" value={String(!active)}/><MonitorButton active={active} disabled={!active&&!app.canMonitor}/></form>:<Link href="/auth/sign-in" className="button-link">Monitor {app.name}</Link>}{externalUrl(app.website)&&<a className="text-link" href={externalUrl(app.website)} rel="noreferrer">Official website ↗</a>}{externalUrl(app.repository)&&<a className="text-link" href={externalUrl(app.repository)} rel="noreferrer">Source repository ↗</a>}</div></section>{app.historyLimited&&<div className="notice"><strong>Recent release history</strong><p>The upstream source contains more history than the current polling window. Recent updates are shown; this is not a complete release archive.</p></div>}<div className="app-detail-grid"><section aria-labelledby="releases-title"><div className="section-heading"><h2 id="releases-title">Stable releases</h2><span className="muted">{details?.releases.length??0} shown</span></div>{details?.releases.length?details.releases.map(release=><ReleaseNotes key={release.id} release={release}/>):<div className="empty-state"><h3>No release history yet.</h3><p>{app.sourceState==='unsupported'?'No supported stable-release feed is configured.':'Releases will appear after a successful source check. Existing history is kept separate from new digest updates.'}</p></div>}</section><aside className="panel source-panel"><h2>About this source</h2><p>Curated from official project information. Catalog definitions are reviewed in Git.</p><dl><dt>Last successful check</dt><dd>{dateLabel(app.lastSuccessfulPoll)}</dd><dt>Release channel</dt><dd>Stable releases</dd></dl>{details?.sources.map((source,index)=><div className="source-record" key={index}><strong>{source.provider}</strong><p>{source.enabled?'Enabled':'Paused'} · {source.historyLimited?'Recent history only':'Within configured history window'}</p>{externalUrl(source.url)&&<a href={externalUrl(source.url)} rel="noreferrer" className="text-link">Upstream release source ↗</a>}</div>)}<details><summary>Catalog provenance</summary>{details?.provenance.length?details.provenance.map((record,index)=><div key={index}><code>{record.path}</code><p>{record.provider} · revision {record.revision.slice(0,12)} · observed {dateLabel(record.lastSeenAt)}</p></div>):<code>catalog/services/{app.slug}.json</code>}</details><a className="text-link" href={`https://github.com/labticker/platform/blob/main/catalog/services/${app.slug}.json`} rel="noreferrer">Review the definition ↗</a></aside></div><WebsiteAdSlot placement="public-app-detail"/><SiteFooter/></main>;
}
