import {describe,it,expect} from 'vitest';
import {renderEmailReleaseNotes} from './release-notes.js';

describe('email release notes',()=>{
 it('renders upstream HTML and Markdown rather than escaped tags',()=>{
  const html=renderEmailReleaseNotes('<h3>Changes</h3><ul><li><strong>Fixed</strong> startup &amp; shutdown</li></ul>');
  expect(html.html).toContain('<h3>Changes</h3>');expect(html.html).toContain('<strong>Fixed</strong>');
  expect(html.text).toContain('Fixed startup & shutdown');expect(html.text).not.toContain('<');
  const markdown=renderEmailReleaseNotes('## :rocket: Changes\n\n- **Fixed** startup\n- `:link:`\n\n[Release](https://github.com/example/project)');
  expect(markdown.html).toContain('<h2>🚀 Changes</h2>');expect(markdown.html).toContain('<strong>Fixed</strong>');
  expect(markdown.html).toContain('<code>:link:</code>');expect(markdown.html).toContain('href="https://github.com/example/project"');
  expect(markdown.text).not.toContain('**Fixed**');
 });
 it('removes active content, tracking resources and unsafe attributes/links',()=>{
  const result=renderEmailReleaseNotes('<script>alert(1)</script><style>body{background:url(https://bad.example/p)}</style><p onclick="bad()" style="color:red">Safe</p><img src="https://bad.example/pixel"><iframe src="https://bad.example"></iframe><a href="javascript:alert(1)">Bad</a>\n\n![pixel](https://bad.example/pixel)');
  expect(result.html).toContain('<p>Safe</p>');
  expect(result.html).not.toMatch(/script|style|onclick|img|iframe|javascript:|bad\.example|alert\(1\)/i);
  expect(result.text).toContain('Safe');
 });
 it('keeps intentional code examples literal and repairs truncated markup',()=>{
  expect(renderEmailReleaseNotes('`<p>example</p>`').html).toContain('<code>&#x3C;p>example&#x3C;/p></code>');
  expect(renderEmailReleaseNotes('<ul><li>Truncated <strong>note').html).toContain('<strong>note</strong>');
 });
});
