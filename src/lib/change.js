// Decision change detection: pure functions, no network, no AI.
// Given two versions of a Confluence decision page (storage format), says exactly one of:
//   'retired'  the status moved to Superseded, Deprecated, Rejected, Abandoned (or Withdrawn, Archived, Replaced)
//   'changed'  the decision text itself changed (sentences removed or added)
//   'ignored'  anything else: edits outside the decision text, or only spacing, case or punctuation
// The same two inputs always give the same answer.

export const RETIRED = /\b(supersed\w*|deprecat\w*|reject\w*|abandon\w*|withdrawn|archived|replaced|no longer applies)\b/i;

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export const textOf = (html) => decode(String(html || '')
  .replace(/<ac:placeholder>[\s\S]*?<\/ac:placeholder>/g, ' ')
  .replace(/<ac:structured-macro[^>]*ac:name="status"[^>]*>[\s\S]*?<ac:parameter ac:name="title">([\s\S]*?)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g, ' $1 ')
  .replace(/<\/(p|li|h\d|tr|blockquote|div)>/g, ' \n ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .trim();

// Status: a table row "Status", else a "Status" heading (ADR files), else a "Status: X" line, else a status lozenge, else a
// "superseded by" / "deprecated" note at the top of the page. Empty when the page has none.
export const statusOf = (html) => {
  const h = String(html || '');
  const row = /<tr[^>]*>\s*<t[hd][^>]*>\s*(?:<[^>]+>\s*)*Status\s*(?:<[^>]+>\s*)*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(h);
  if (row) return textOf(row[1]).replace(/\s+/g, ' ').trim();
  const sec = /<h([1-4])[^>]*>\s*(?:<[^>]+>\s*)*Status\s*(?:<[^>]+>\s*)*<\/h\1>([\s\S]*?)(?=<h[1-4][^>]*>|$)/i.exec(h);
  if (sec && textOf(sec[2])) return textOf(sec[2]).split('\n')[0].slice(0, 80).trim();
  const line = /(?:^|\n)\s*Status\s*:\s*([^\n]{1,60})/i.exec(textOf(h));
  if (line) return line[1].trim();
  const loz = /<ac:structured-macro[^>]*ac:name="status"[^>]*>[\s\S]*?<ac:parameter ac:name="title">([\s\S]*?)<\/ac:parameter>/i.exec(h);
  if (loz) return textOf(loz[1]).trim();
  const head = textOf(h.split(/<h[1-3][^>]*>/i)[0] || '');
  const note = /\b(superseded|deprecated|rejected)\b/i.exec(head);
  return note ? note[1][0].toUpperCase() + note[1].slice(1).toLowerCase() : '';
};

// The decision text: the section under a "Decision" or "Outcome" heading, or the "Decision" /
// "Outcome" table row. When the page has neither, the whole page text (so any wording edit counts).
export const decisionTextOf = (html) => {
  const h = String(html || '');
  const sec = /<h([1-4])[^>]*>(?:(?!<\/h\1>)[\s\S])*?\b(Decision|Outcome)\s*<\/h\1>([\s\S]*?)(?=<h[1-4][^>]*>|$)/i.exec(h);
  if (sec) return textOf(sec[3]);
  const row = /<tr[^>]*>\s*<t[hd][^>]*>\s*(?:<[^>]+>\s*)*(Decision|Outcome)\s*(?:<[^>]+>\s*)*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(h);
  if (row) return textOf(row[2]);
  return textOf(h);
};

// "Superseded by <link>": the first link after the words "superseded by", "replaced by" or "see".
export const replacementOf = (html) => {
  const h = String(html || '');
  const at = h.search(/(superseded|replaced)\s+by|superseded\b/i);
  if (at < 0) return null;
  const tail = h.slice(at, at + 1500);
  const a = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(tail);
  const pageLink = /<ac:link[^>]*>[\s\S]*?<ri:page[^>]*ri:content-title="([^"]+)"[\s\S]*?<\/ac:link>/i.exec(tail);
  const first = [a && { i: a.index, title: textOf(a[2]) || a[1], url: decode(a[1]) }, pageLink && { i: pageLink.index, title: decode(pageLink[1]), url: '' }]
    .filter(Boolean).sort((x, y) => x.i - y.i)[0];
  return first ? { title: first.title, url: first.url } : null;
};

// Sentences, compared after folding case, spacing and punctuation.
export const sentences = (text) => String(text || '')
  .split(/\n+|(?<=[.!?])\s+/)
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter((s) => /[A-Za-z0-9\u3131-\uD79D]/.test(s));
export const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u3131-\uD79D]+/g, ' ').trim();

export const sentenceDiff = (before, after) => {
  const a = sentences(before);
  const b = sentences(after);
  const fa = new Set(a.map(fold));
  const fb = new Set(b.map(fold));
  return { removed: a.filter((s) => !fb.has(fold(s))), added: b.filter((s) => !fa.has(fold(s))) };
};

export const compareVersions = (oldHtml, newHtml) => {
  const fromStatus = statusOf(oldHtml);
  const toStatus = statusOf(newHtml);
  const diff = sentenceDiff(decisionTextOf(oldHtml), decisionTextOf(newHtml));
  const textChanged = diff.removed.length > 0 || diff.added.length > 0;
  const statusRetired = RETIRED.test(toStatus) && !RETIRED.test(fromStatus);
  const kind = statusRetired ? 'retired' : textChanged ? 'changed' : 'ignored';
  return {
    kind,
    fromStatus: fromStatus || 'none',
    toStatus: toStatus || 'none',
    removed: diff.removed.slice(0, 6),
    added: diff.added.slice(0, 6),
    replacement: kind === 'retired' ? replacementOf(newHtml) : null,
    reason: kind === 'retired' ? `Status changed from ${fromStatus || 'none'} to ${toStatus}`
      : kind === 'changed' ? `Decision text changed (${diff.removed.length} sentence(s) removed, ${diff.added.length} added)`
        : 'No status change to a retired state and no change to the decision sentences',
  };
};

// Confluence page ids referenced by a Jira work item: links in the description (any ADF node
// with a URL: text links, smart links, cards) and remote links (Jira's "Link Confluence page").
const PAGE_URL = /\/wiki\/(?:spaces\/[^/\s"]+\/pages\/|pages\/viewpage\.action\?pageId=|x\/)?(\d{4,})|[?&]pageId=(\d{4,})|\/pages\/(\d{4,})/;
export const pageIdFromUrl = (url, siteHost) => {
  const u = String(url || '');
  if (siteHost && u.startsWith('http') && !u.includes(siteHost)) return null;
  if (!/\/wiki\/|pageId=/.test(u)) return null;
  const m = PAGE_URL.exec(u);
  return m ? (m[1] || m[2] || m[3]) : null;
};

export const urlsInAdf = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => urlsInAdf(n, out)); return out; }
  const attrs = node.attrs || {};
  if (attrs.url) out.push(attrs.url);
  if (attrs.href) out.push(attrs.href);
  (node.marks || []).forEach((m) => m && m.attrs && m.attrs.href && out.push(m.attrs.href));
  if (typeof node.text === 'string') (node.text.match(/https?:\/\/\S+/g) || []).forEach((u) => out.push(u));
  urlsInAdf(node.content, out);
  return out;
};

export const linkedPageIds = ({ description, remoteLinks }, siteHost) => {
  const found = new Map();
  urlsInAdf(description).forEach((u) => { const id = pageIdFromUrl(u, siteHost); if (id && !found.has(id)) found.set(id, 'description link'); });
  (remoteLinks || []).forEach((r) => {
    const g = /pageId=(\d+)/.exec(r.globalId || '');
    const id = g ? g[1] : pageIdFromUrl(r.object && r.object.url, siteHost);
    if (id && !found.has(id)) found.set(id, 'Confluence link');
  });
  return [...found.entries()].map(([pageId, via]) => ({ pageId, via }));
};
