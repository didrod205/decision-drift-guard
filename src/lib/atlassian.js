import api, { route } from '@forge/api';
import { DECISION_LABEL, parseDecisionPage, adfToText } from './core';

// All decision pages (label "decision") from Confluence on the same site.
// as: 'user' (UI and Rovo: respects the viewer's permissions) or 'app' (event trigger)
const who = (as) => (as === 'app' ? api.asApp() : api.asUser());

export const fetchDecisions = async (as = 'user') => {
  const cql = `type=page and label="${DECISION_LABEL}" order by lastmodified desc`;
  const res = await who(as)
    .requestConfluence(route`/wiki/rest/api/content/search?cql=${cql}&limit=100&expand=body.storage,version`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Confluence search failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const base = (data._links && data._links.base) || '';
  return (data.results || []).map((p) =>
    parseDecisionPage({
      id: p.id,
      title: p.title,
      url: base + ((p._links && p._links.webui) || ''),
      body: p.body && p.body.storage ? p.body.storage.value : '',
      lastUpdated: p.version ? p.version.when : null,
    })
  );
};

export const getIssue = async (key, as = 'user') => {
  const res = await who(as)
    .requestJira(route`/rest/api/3/issue/${key}?fields=summary,description,labels,status,project`);
  if (!res.ok) throw new Error(`Jira issue ${key} not readable (${res.status})`);
  const j = await res.json();
  return {
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

export const commentConflicts = async (issueKey, result) => {
  const content = [
    { type: 'paragraph', content: [t('Decision Drift Guard: ', true), t('this work item conflicts with a recorded decision. Evidence below. Nothing was changed on the decision pages.')] },
  ];
  const items = result.conflicts.map((c) => ({
    type: 'listItem',
    content: [{
      type: 'paragraph',
      content: [
        linkText(c.title, c.url),
        t(` (${c.status}${c.decidedOn ? ', ' + c.decidedOn : ''}). `),
        t(c.evidence ? c.evidence.rule + '. ' : ''),
        t(c.evidence && c.evidence.issueQuote ? `This item says: "${c.evidence.issueQuote}". ` : ''),
        t(c.instead ? `Instead: ${c.instead}` : ''),
      ].filter((n) => n.text),
    }],
  }));
  content.push({ type: 'bulletList', content: items });
  content.push({ type: 'paragraph', content: [t('If the decision should change, use "Request reopen" in the Decision Drift Guard panel so the owner sees it on the decision page.')] });
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
