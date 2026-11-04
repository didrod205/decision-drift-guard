import api, { route } from '@forge/api';
import { decisionsFromPage, adfToText } from './core';
import { getSettings } from './store';

// as: 'user' (UI and Rovo: respects the viewer's permissions) or 'app' (event trigger)
const who = (as) => (as === 'app' ? api.asApp() : api.asUser());

const q = (x) => `"${String(x).replace(/["\\]/g, '')}"`;

// Decision records, found four ways (Settings decide which):
// 1. pages with a decision label, 2. pages made from Confluence's "Decision documentation"
// template (Page Properties table with Status + an Outcome section), 3. inline decisions
// (/decision) on any page in the chosen spaces, 4. titles that match the title words.
export const fetchDecisions = async (as = 'user', settingsIn) => {
  const st = settingsIn || (await getSettings());
  const parts = [];
  if (st.labels.length) parts.push(`label in (${st.labels.map(q).join(',')})`);
  st.titleWords.forEach((w) => parts.push(`title ~ ${q(w)}`));
  if (st.spaces.length) parts.push(`space in (${st.spaces.map(q).join(',')})`);
  if (!parts.length) return [];
  const cql = `type=page and (${parts.join(' or ')}) order by lastmodified desc`;
  const res = await who(as)
    .requestConfluence(route`/wiki/rest/api/content/search?cql=${cql}&limit=100&expand=body.storage,version,metadata.labels`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Confluence search failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const base = (data._links && data._links.base) || '';
  const wanted = new Set(st.labels.map((l) => l.toLowerCase()));
  const titleRe = st.titleWords.length ? new RegExp(st.titleWords.map((w) => w.replace(/[^A-Za-z0-9 -]/g, '')).join('|'), 'i') : null;
  return (data.results || []).flatMap((p) => {
    const labels = ((p.metadata && p.metadata.labels && p.metadata.labels.results) || []).map((l) => l.name.toLowerCase());
    return decisionsFromPage({
      id: p.id,
      title: p.title,
      url: base + ((p._links && p._links.webui) || ''),
      body: p.body && p.body.storage ? p.body.storage.value : '',
      lastUpdated: p.version ? p.version.when : null,
      labelled: labels.some((l) => wanted.has(l)),
      titleMatch: !!(titleRe && titleRe.test(p.title || '')),
    }).filter((d) => st.useTemplate || d.source !== 'template').filter((d) => st.useInline || d.source !== 'decision-item');
  });
};

export const getIssue = async (key, as = 'user') => {
  const res = await who(as)
    .requestJira(route`/rest/api/3/issue/${key}?fields=summary,description,labels,status,project`);
  if (!res.ok) throw new Error(`Jira issue ${key} not readable (${res.status})`);
  const j = await res.json();
  // Pull requests linked to the work item as remote links (title + URL only; diffs are not read).
  let linkedPRs = [];
  try {
    const rl = await who(as).requestJira(route`/rest/api/3/issue/${key}/remotelink`);
    if (rl.ok) {
      linkedPRs = (await rl.json())
        .map((x) => x.object || {})
        .filter((o) => o.title && /\/pull\/\d|\/pull-requests\/\d|\/merge_requests\/\d/.test(o.url || ''))
        .slice(0, 10)
        .map((o) => ({ title: String(o.title).slice(0, 200), url: o.url }));
    }
  } catch (e) { linkedPRs = []; }
  return {
    linkedPRs,
    key: j.key,
    summary: j.fields.summary || '',
    description: adfToText(j.fields.description).trim(),
    labels: j.fields.labels || [],
    status: j.fields.status ? j.fields.status.name : '',
    project: j.fields.project ? j.fields.project.key : '',
  };
};

const linkText = (text, href) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });
const t = (text, strong) => (strong ? { type: 'text', text, marks: [{ type: 'strong' }] } : { type: 'text', text });

const card = (c, possible) => ({
  type: 'listItem',
  content: [{
    type: 'paragraph',
    content: [
      linkText(c.title, c.url),
      t(` (${c.status}${c.decidedOn ? ', ' + c.decidedOn : ''}). `),
      t(c.evidence && c.evidence.rule ? `${possible ? 'Decision rule' : 'Rule broken'}: ${c.evidence.rule.replace(/^Do not: /, 'Do not ')}. ` : ''),
      t(c.evidence && c.evidence.issueQuote ? `This item says: "${c.evidence.issueQuote}". ` : ''),
      t(possible && c.evidence && c.evidence.readAs && c.evidence.readAs.length ? `Matched by meaning: ${c.evidence.readAs.join('; ')}. ` : ''),
      t(c.instead ? `Instead: ${c.instead}` : ''),
    ].filter((n) => n.text),
  }],
});

export const commentConflicts = async (issueKey, result) => {
  const content = [];
  if (result.conflicts.length) {
    content.push({ type: 'paragraph', content: [t('Decision Drift Guard: ', true), t('this work item conflicts with a recorded decision. Evidence below.')] });
    content.push({ type: 'bulletList', content: result.conflicts.map((c) => card(c, false)) });
  }
  if ((result.possible || []).length) {
    content.push({ type: 'paragraph', content: [t('Decision Drift Guard, possible conflict: ', true), t('the wording differs from the decision, but it seems to describe the same thing. Please confirm.')] });
    content.push({ type: 'bulletList', content: result.possible.map((c) => card(c, true)) });
  }
  content.push({ type: 'paragraph', content: [t('Nothing was changed on the decision pages. Open the Decision check panel to ask the Rovo agent for a verdict, or to request that the decision be reopened.')] });
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body: { type: 'doc', version: 1, content } }),
  });
  if (!res.ok) throw new Error(`Comment failed (${res.status})`);
};

export const addIssueLabel = async (issueKey, label) => {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: [{ add: label }] } }),
  });
  if (!res.ok) throw new Error(`Label failed (${res.status})`);
};

// Reopen request = footer comment on the decision page. The decision body stays untouched.
export const requestReopen = async ({ pageId, issueKey, issueUrl, reason }) => {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const value = `<p><strong>Reopen requested</strong> from work item <a href="${esc(issueUrl)}">${esc(issueKey)}</a>.</p><p>Reason: ${esc(reason || 'Not given')}</p><p><em>Posted by Decision Drift Guard. The decision above was not modified.</em></p>`;
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/footer-comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ pageId: String(pageId), body: { representation: 'storage', value } }),
  });
  if (!res.ok) {
    const tx = await res.text();
    throw new Error(`Reopen comment failed (${res.status}): ${tx.slice(0, 200)}`);
  }
  const c = await res.json();
  await addIssueLabel(issueKey, 'decision-reopen-requested').catch(() => {});
  return { commentId: c.id };
};

export const siteBase = async () => {
  const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`);
  const j = await res.json();
  return j.baseUrl;
};
