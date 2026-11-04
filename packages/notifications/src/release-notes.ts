import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkGemoji from 'remark-gemoji';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import {toText} from 'hast-util-to-text';

// Parse upstream Markdown/HTML as data. Only these email-safe elements survive;
// no remote images, styles, scripts, forms or upstream attributes are retained.
const processor=unified().use(remarkParse).use(remarkGfm).use(remarkGemoji)
 .use(remarkRehype,{allowDangerousHtml:true}).use(rehypeRaw)
 .use(rehypeSanitize,{
  tagNames:['p','br','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','blockquote','pre','code','a','hr','table','thead','tbody','tr','th','td'],
  attributes:{a:['href','title']},protocols:{href:['https']},
  strip:['script','style','iframe','object','embed','img','svg','math','form','input','textarea','button','link','meta'],
 }).use(rehypeStringify);

export function renderEmailReleaseNotes(notes:string):{html:string;text:string}{
 // Callers retain bounded excerpts; the parser safely handles truncated markup.
 const tree=processor.runSync(processor.parse(notes));
 return {html:processor.stringify(tree),text:toText(tree)};
}
