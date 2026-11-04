// Decision change detection: pure functions, no network, no AI.
// Given two versions of a Confluence decision page (storage format), says exactly one of:
//   'retired'  the status moved to Superseded, Deprecated, Rejected, Abandoned (or Withdrawn, Archived, Replaced)
//   'changed'  the decision text itself changed (sentences removed or added)
//   'ignored'  anything else: edits outside the decision text, or only spacing, case, punctuation, links or small typos
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
  // Inline decisions typed with /decision: only the decided items count as the decision text.
  const items = [...h.matchAll(/<ac:adf-node type="decision-item">([\s\S]*?)<\/ac:adf-node>/g)]
    .filter((m) => !/<ac:adf-attribute key="state">(?!DECIDED)/.test(m[1]))
    .map((m) => { const c = /<ac:adf-content>([\s\S]*?)<\/ac:adf-content>/.exec(m[1]); return c ? textOf(c[1]) : ''; })
    .filter(Boolean);
  if (items.length) return items.join('\n');
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
// Folding drops case, spacing, punctuation and web addresses (a link moved to a new URL is not a new decision).
export const fold = (s) => String(s || '').replace(/https?:\/\/\S+|\(\.{0,2}\/[^)\s]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9\u3131-\uD79D]+/g, ' ').trim();

// Small edit distance between two words (stops counting above max).
export const editDistance = (a, b, max = 3) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

// Words whose change can flip a decision: never treated as typos.
const KEEP = new Set('must should shall may might can cannot will would not never always only avoid allow allowed use used uses using stop start enable disable enabled disabled require required optional deprecated replace instead before after more less most least all none some any no yes'.split(' '));
const NEG_PREFIX = /^(un|dis|in|im|non|de)/;

// Small grammar words a proofreading fix may add, drop or swap ("the", "be", "is", a doubled word).
const FUNC = new Set('a an the be is are was were to of by it its that this these those which as down'.split(' '));
const typoPair = (x, y) => (x.length >= 4 && y.length >= 4 && !/\d/.test(x + y) && !KEEP.has(x) && !KEEP.has(y)
  && !(NEG_PREFIX.test(x) && x.replace(NEG_PREFIX, '') === y) && !(NEG_PREFIX.test(y) && y.replace(NEG_PREFIX, '') === x)
  && editDistance(x, y, 2) <= 2) || (FUNC.has(x) && FUNC.has(y));

// A typo or formatting fix: the same words once case, spacing, punctuation, list markers and links are dropped
// (so re-wrapped lines and lists count as the same), or a word-by-word alignment where every difference is
// a small spelling fix (2 letters at most, words of 4+ letters, no digits, no modal or negation words), a
// grammar word added, dropped or swapped, or a doubled word removed. At most 2 such fixes, or 1 in 10 words.
export const isTrivialEdit = (before, after) => {
  const a = fold(before).split(' ').filter(Boolean);
  const b = fold(after).split(' ').filter(Boolean);
  if (a.join('') === b.join('')) return true;
  if (a.length > 400 || b.length > 400) return false;
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const gaps = [];
  let i = 0; let j = 0; let del = []; let ins = [];
  const flush = (k) => { if (del.length || ins.length) gaps.push({ del, ins, prev: a[i - del.length - 1], next: a[k] }); del = []; ins = []; };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { flush(i); i++; j++; } else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) { ins.push(b[j]); j++; } else { del.push(a[i]); i++; }
  }
  flush(i);
  let fixes = 0;
  for (const g of gaps) {
    if (g.del.join('') === g.ins.join('')) { fixes++; continue; }
    if (g.del.length && g.del.length === g.ins.length && g.del.every((w, k) => typoPair(w, g.ins[k]))) { fixes += g.del.length; continue; }
    const loose = (w) => FUNC.has(w) || w === g.prev || w === g.next;
    if (!(g.del.length && g.ins.length) && [...g.del, ...g.ins].every(loose)) { fixes += g.del.length + g.ins.length; continue; }
    return false;
  }
  return fixes <= Math.max(2, Math.ceil(Math.min(a.length, b.length) / 10));
};

export const sentenceDiff = (before, after) => {
  const a = sentences(before);
  const b = sentences(after);
  const fa = new Set(a.map(fold));
  const fb = new Set(b.map(fold));
  let removed = a.filter((s) => !fb.has(fold(s)));
  let added = b.filter((s) => !fa.has(fold(s)));
  // Pair each removed sentence with an added one that is only a typo or formatting fix of it.
  const trivial = [];
  const used = new Set();
  removed = removed.filter((r) => {
    const j = added.findIndex((x, k) => !used.has(k) && isTrivialEdit(r, x));
    if (j < 0) return true;
    used.add(j); trivial.push([r, added[j]]);
    return false;
  });
  added = added.filter((_, k) => !used.has(k));
  // Lines re-wrapped or a list re-flowed: the remaining removed and added text together is only a fix.
  if ((removed.length || added.length) && isTrivialEdit(removed.join(' '), added.join(' '))) {
    trivial.push([removed.join(' '), added.join(' ')]);
    removed = []; added = [];
  }
  return { removed, added, trivial };
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
        : diff.trivial.length ? `Only typo, spacing, punctuation or link fixes in the decision text (${diff.trivial.length} sentence(s))`
          : 'No status change to a retired state and no change to the decision sentences',
    trivial: diff.trivial.length,
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

// Message shown when the close check stops a transition.
export const closeMessage = (open) => {
  const one = open[0];
  const more = open.length > 1 ? ` and ${open.length - 1} more` : '';
  const rep = one.replacement ? ` (replaced by ${one.replacement.title})` : '';
  return `This work item follows "${one.title}", which is now ${one.status}${rep}${more}. Check the work against the current decision, then press "Checked against the current decision" or "Unlink" in the Decision check panel and try again.`;
};
