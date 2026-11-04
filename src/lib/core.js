// Decision Drift Guard: deterministic core (no LLM here).
// Principles: (1) no warning without evidence (page link + quoted rule),
// (2) "conflict" and "needs judgment" are different states,
// (3) the original decision page is never edited.

export const DECISION_LABEL = 'decision';
const INACTIVE = /supersed|reject|archiv|withdrawn|draft|not started|cancel/i;

export const norm = (s) =>
  ` ${String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\uD79D]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

export const splitTerms = (s) =>
  String(s || '')
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);

const stripTags = (html) =>
  String(html || '')
    // status lozenge macro: keep only its title
    .replace(/<ac:structured-macro[^>]*ac:name="status"[^>]*>[\s\S]*?<ac:parameter ac:name="title">([\s\S]*?)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

// Reads "Decision summary" style tables: <tr><th>Key</th><td>Value</td></tr>
export const parseDecisionPage = (page) => {
  const html = page.body || '';
  const fields = {};
  const rowRe = /<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const k = stripTags(m[1]).toLowerCase();
    if (k && !(k in fields)) fields[k] = stripTags(m[2]);
  }
  const idMatch = /^([A-Z]{2,10}-\d+)/.exec(page.title || '');
  const status = fields.status || 'Unknown';
  return {
    pageId: page.id,
    key: idMatch ? idMatch[1] : null,
    title: page.title,
    url: page.url,
    status,
    active: !INACTIVE.test(status),
    outcome: fields.outcome || fields.decision || '',
    applies: splitTerms(fields['applies to'] || fields.scope || ''),
    donot: splitTerms(fields['do not'] || fields.avoid || ''),
    instead: fields.instead || '',
    decidedOn: fields['decided on'] || fields['due date'] || '',
    supersededBy: fields['superseded by'] || '',
    lastUpdated: page.lastUpdated || null,
  };
};

const hits = (text, terms) => {
  const seen = new Set();
  return terms.filter((t) => {
    const n = norm(t);
    if (n.trim().length < 2 || seen.has(n)) return false;
    const ok = text.includes(n) || text.includes(n.replace(/ $/, 's '));
    if (ok) seen.add(n);
    return ok;
  });
};

// Pulls a short quote around the first match from the issue text, for evidence.
const quoteFrom = (raw, term) => {
  const r = String(raw || '');
  const words = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const idx = r.toLowerCase().indexOf(words[0] || '');
  if (idx < 0) return '';
  const start = Math.max(0, idx - 40);
  return (start > 0 ? '...' : '') + r.slice(start, idx + 80).trim() + (idx + 80 < r.length ? '...' : '');
};

export const MIN_WORDS = 4;

export const checkIssue = (issue, decisionsAll) => {
  const raw = `${issue.summary || ''}. ${issue.description || ''} ${(issue.labels || []).join(' ')}`.trim();
  const text = norm(raw);
  const words = text.trim().split(' ').filter(Boolean).length;
  const active = decisionsAll.filter((d) => d.active);
  const inactive = decisionsAll.filter((d) => !d.active);
  const base = {
    issueKey: issue.key,
    checkedAt: new Date().toISOString(),
    decisionCount: active.length,
    ignoredInactive: [],
    conflicts: [],
    related: [],
  };
  if (decisionsAll.length === 0) {
    return { ...base, state: 'no-decisions', message: `No Confluence pages with the label "${DECISION_LABEL}" were found, so there is nothing to compare against.` };
  }
  if (words < MIN_WORDS) {
    return { ...base, state: 'insufficient', message: `This work item has only ${words} ${words === 1 ? 'word' : 'words'}. Add a description so it can be compared with decisions.` };
  }
  for (const d of inactive) {
    const a = hits(text, d.applies);
    const x = hits(text, d.donot);
    if (a.length || x.length) base.ignoredInactive.push({ key: d.key, title: d.title, url: d.url, status: d.status, supersededBy: d.supersededBy });
  }
  for (const d of active) {
    const a = hits(text, d.applies);
    const x = hits(text, d.donot);
    const card = {
      key: d.key, pageId: d.pageId, title: d.title, url: d.url, status: d.status,
      outcome: d.outcome, instead: d.instead, decidedOn: d.decidedOn,
      matchedScope: a, matchedRule: x,
      evidence: x.length ? { rule: `Do not: ${x.join(', ')}`, issueQuote: quoteFrom(raw, x[0]) } : null,
    };
    if (x.length) base.conflicts.push(card);
    else if (a.length) base.related.push(card);
  }
  let state = 'clear';
  if (base.conflicts.length) state = 'conflict';
  else if (base.related.length) state = 'needs-judgment';
  const message = {
    conflict: `Conflicts with ${base.conflicts.map((c) => c.key || c.title).join(', ')}. Each warning quotes the rule it breaks.`,
    'needs-judgment': `Touches ${base.related.map((c) => c.key || c.title).join(', ')} but no rule is broken word for word. Ask the agent or read the decision before starting.`,
    clear: `No active decision covers this work item (${active.length} decisions checked).`,
  }[state];
  return { ...base, state, message };
};

// Atlassian Document Format to plain text
export const adfToText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem'].includes(node.type) ? inner + ' ' : inner;
};
