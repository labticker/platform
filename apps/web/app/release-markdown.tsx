import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Notes are data, never executable HTML. Relative links point upstream, not into LabTicker. */
export function releaseNoteUrl(value:string,sourceUrl?:string):string|undefined{
 try{const url=new URL(value,sourceUrl);return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
export function ReleaseMarkdown({notes,sourceUrl}:{notes:string;sourceUrl?:string}){
 return <div className="release-excerpt release-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml
  urlTransform={(value,key)=>key==='href'?releaseNoteUrl(value,sourceUrl):undefined}
  components={{
   a:({href,children})=>href?<a href={href} rel="noreferrer noopener" className="text-link">{children}</a>:<span>{children}</span>,
   // Upstream images can contain tracking URLs. Keep their descriptions without fetching them.
   img:({alt})=><span className="muted">{alt?`[Image: ${alt}]`:'[Image omitted]'}</span>,
   h1:({children})=><h4>{children}</h4>,h2:({children})=><h4>{children}</h4>,h3:({children})=><h4>{children}</h4>,
   h4:({children})=><h5>{children}</h5>,h5:({children})=><h6>{children}</h6>,
  }}>{notes||'Upstream did not include release notes.'}</Markdown></div>;
}
