import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReleaseMarkdown,releaseNoteUrl} from '../app/release-markdown';
const render=(notes:string)=>renderToStaticMarkup(createElement(ReleaseMarkdown,{notes,sourceUrl:'https://github.com/example/project/releases/tag/v2'}));
test('release Markdown renders headings, lists, emphasis, code and GitHub tables',()=>{
 const html=render('## Changes\n\n**Fixed** *formatting*.\n\n- One\n- Two\n\n```sh\necho hello\n```\n\n| Change | Status |\n| --- | --- |\n| UI | Done |\n\n~~Old~~');
 for(const part of ['<h4>Changes</h4>','<strong>Fixed</strong>','<em>formatting</em>','<ul>','<li>One</li>','<pre><code class="language-sh">','<table>','<del>Old</del>'])assert.ok(html.includes(part),part);
});
test('upstream Markdown cannot execute HTML, unsafe links or load remote images',()=>{
 const html=render('<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n![Diagram](https://tracker.example/diagram.png)\n\n[Safe](https://example.com/docs)\n\n[Relative](../../compare/v1...v2)');
 assert.doesNotMatch(html,/<script|<img|onerror|javascript:|tracker\.example/);
 assert.match(html,/\[Image: Diagram\]/);assert.match(html,/href="https:\/\/example.com\/docs"/);assert.match(html,/rel="noreferrer noopener"/);
 assert.match(html,/href="https:\/\/github.com\/example\/project\/compare\/v1\.\.\.v2"/);
 for(const value of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:pass@example.com'])assert.equal(releaseNoteUrl(value),undefined);
});
