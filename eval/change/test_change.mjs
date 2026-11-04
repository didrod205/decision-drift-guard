// Unit tests for the deterministic decision-change rules (run: node eval/change/test_change.mjs)
import fs from 'fs';
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
fs.copyFileSync(new URL('../../src/lib/change.js', import.meta.url), new URL('./.build/change.mjs', import.meta.url));
const C = await import('./.build/change.mjs');
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); };
const page = (status, dec, ctx = 'Using multiple HTTP packages increases complexity.', extra = '') =>
  `${extra}<table><tbody><tr><th>Status</th><td>${status}</td></tr></tbody></table><h2>Context</h2><p>${ctx}</p><h2>Decision</h2><p>${dec}</p><h2>Consequences</h2><p>Fewer packages.</p>`;
const D = 'Backend (node) packages should use the node-fetch package for HTTP data fetching. Frontend packages should use fetchApiRef.';
// 1 status to Superseded, with a replacement link
const r1 = C.compareVersions(page('Accepted', D), page('Superseded', D, undefined, '<p>This ADR has been superseded by <a href="https://x.atlassian.net/wiki/spaces/ENGS/pages/555">ADR014</a> and no longer applies.</p>'));
eq('retired kind', r1.kind, 'retired'); eq('retired from-to', [r1.fromStatus, r1.toStatus], ['Accepted', 'Superseded']); eq('replacement', r1.replacement, { title: 'ADR014', url: 'https://x.atlassian.net/wiki/spaces/ENGS/pages/555' });
for (const s of ['Deprecated', 'Rejected', 'SUPERSEDED by ADR-045', 'Withdrawn', 'ABANDONED']) eq(`retired ${s}`, C.compareVersions(page('Accepted', D), page(s, D)).kind, 'retired');
// 2 already retired, edited again: not a new retirement; text same: ignored
eq('retired again', C.compareVersions(page('Superseded', D), page('Deprecated', D)).kind, 'ignored');
// 3 status moves between active states only: ignored
eq('proposed to accepted', C.compareVersions(page('Proposed', D), page('Accepted', D)).kind, 'ignored');
// 4 decision text: a sentence replaced
const D2 = 'Backend (node) packages should use the native fetch for HTTP data fetching. Frontend packages should use fetchApiRef.';
const r4 = C.compareVersions(page('Accepted', D), page('Accepted', D2));
eq('changed kind', r4.kind, 'changed'); eq('changed removed', r4.removed, ['Backend (node) packages should use the node-fetch package for HTTP data fetching.']); eq('changed added', r4.added, ['Backend (node) packages should use the native fetch for HTTP data fetching.']);
// 5 only spacing, case, punctuation inside the decision: ignored
eq('punctuation only', C.compareVersions(page('Accepted', D), page('Accepted', D.replace('(node)', 'node').replace(/\. /, '.  ').toUpperCase())).kind, 'ignored');
// 6 edit outside the decision section (context typo): ignored
eq('context edit', C.compareVersions(page('Accepted', D), page('Accepted', D, 'Using many HTTP packages increases complexity.')).kind, 'ignored');
// 7 no status anywhere, ADR "Status" heading format
const adr = (st, dec) => `<h1>ADR 010</h1><h2>Status</h2><p>${st}</p><h2>Decision</h2><p>${dec}</p>`;
eq('heading status', C.statusOf(adr('SUPERSEDED by ADR-045', 'x')), 'SUPERSEDED by ADR-045');
eq('heading retired', C.compareVersions(adr('Accepted', D), adr('SUPERSEDED by ADR-045', D)).kind, 'retired');
// 8 Backstage note style (status note before the first heading)
eq('note status', C.statusOf('<p>Superseded</p><p>This ADR has been superseded by <a href="./adr014-use-fetch.md">ADR014</a> and no longer applies.</p><h2>Context</h2><p>a</p>'), 'Superseded');
// 9 links in a work item: description link, smart link card, remote link, other site ignored, non-page ignored
const desc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'per ADR', marks: [{ type: 'link', attrs: { href: 'https://acme.atlassian.net/wiki/spaces/ENGS/pages/4063237/ADR-010' } }] }, { type: 'inlineCard', attrs: { url: 'https://acme.atlassian.net/wiki/spaces/ENGS/pages/3735561' } }, { type: 'text', text: ' see https://other.atlassian.net/wiki/spaces/X/pages/99999 and https://acme.atlassian.net/browse/PLAT-1' }] }] };
const remote = [{ globalId: 'appId=abc&pageId=3571796', object: { url: 'https://acme.atlassian.net/wiki/pages/viewpage.action?pageId=3571796' } }, { object: { url: 'https://github.com/backstage/backstage/pull/1' } }];
eq('linked pages', C.linkedPageIds({ description: desc, remoteLinks: remote }, 'acme.atlassian.net'), [{ pageId: '4063237', via: 'description link' }, { pageId: '3735561', via: 'description link' }, { pageId: '3571796', via: 'Confluence link' }]);
eq('no links', C.linkedPageIds({ description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bump moment to 2.30' }] }] }, remoteLinks: [] }, 'acme.atlassian.net'), []);
// 10 same inputs, same answer (determinism)
eq('deterministic', JSON.stringify(C.compareVersions(page('Accepted', D), page('Accepted', D2))), JSON.stringify(r4));
console.log(`unit tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
