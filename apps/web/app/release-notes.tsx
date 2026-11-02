import {ReleaseMarkdown} from './release-markdown';
import {dateLabel,externalUrl} from './source-status';
import {TrackedLink} from './tracked-controls';
export function warningLabels(value:unknown):{label:string;evidence:string}[]{return Array.isArray(value)?value.flatMap(item=>item&&typeof item==='object'&&typeof item.label==='string'?[{label:item.label.slice(0,100),evidence:typeof item.evidence==='string'?item.evidence.slice(0,300):''}]:[]):[];}
export function ReleaseNotes({release}:{release:{title:string;tag:string|null;url:string;notes:string;publishedAt:Date|null;firstSeenAt:Date;backfill:boolean;warnings:unknown}}){
 const warnings=warningLabels(release.warnings),url=externalUrl(release.url),date=release.publishedAt??release.firstSeenAt;
 return <article className="release-card">
  <header className="release-card-header">
   <div className="release-heading"><h3>{release.title}</h3>{release.tag&&<span className="version-tag">{release.tag}</span>}</div>
   <div className="release-meta"><span>{release.publishedAt?'Published':'First observed'} <time className="release-date" dateTime={date.toISOString()}>{dateLabel(date)}</time> · UTC</span>{release.backfill&&<span className="badge">Release history</span>}</div>
  </header>
  {warnings.length>0&&<aside className="release-warnings" aria-label="Upgrade advisories">
   <div className="release-warning-heading"><strong>Before you upgrade</strong><span>{warnings.length} {warnings.length===1?'advisory':'advisories'}</span></div>
   <div className="release-warning-labels">{warnings.map((warning,index)=><span className="badge warning" key={index}>{warning.label}</span>)}</div>
   <details><summary>Why these labels?</summary>{warnings.map((warning,index)=>warning.evidence&&<blockquote key={index}>{warning.evidence}</blockquote>)}<p className="fine-print">Advisory labels from release-note wording; review the upstream instructions.</p></details>
  </aside>}
  <p className="release-notes-label">Release notes</p><ReleaseMarkdown notes={release.notes} sourceUrl={url}/>
  <footer className="release-card-footer">{url&&<TrackedLink className="text-link" event="release_notes_link_clicked" href={url} rel="noreferrer">Read full upstream release notes ↗</TrackedLink>}<span className="fine-print">From the official project</span></footer>
 </article>;
}
