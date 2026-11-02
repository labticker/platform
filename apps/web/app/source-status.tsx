import type {CatalogEntry} from './catalog-types';
const labels:Record<CatalogEntry['sourceState'],string>={tracking:'Tracking stable releases',stale:'Refresh overdue',degraded:'Feed temporarily unavailable',pending:'Waiting for first check',paused:'Monitoring paused',unsupported:'No supported release feed',unavailable:'Tracking status unavailable',preview:'Release source configured'};
export function SourceStatus({state,limited=false}:{state:CatalogEntry['sourceState'];limited?:boolean}){return <div className="source-state"><span className={`status-dot ${state}`} aria-hidden="true"/><span>{labels[state]}{limited?' · recent history only':''}</span></div>;}
export function dateLabel(value:string|Date|null){return value?new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)):'Date not supplied';}
/** Only link to stored HTTPS destinations; Markdown links use their own strict HTTPS policy. */
export function externalUrl(value:string|null):string|undefined{if(!value)return undefined;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
