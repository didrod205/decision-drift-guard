// Decision Drift Guard: deterministic core (no LLM here).
// Principles: (1) no warning without evidence (page link + quoted rule),
// (2) "conflict" and "needs judgment" are different states,
// (3) the original decision page is never edited.

import { compileLexicon, compileDecision, tokenize, findConcepts, semanticCheck, overlapScores, quoteAround, literalNotNegated } from './match';

export const DECISION_LABEL = 'decision';
const INACTIVE = /supersed|reject|archiv|withdrawn|draft|not started|in progress|proposed|cancel/i;

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
    .replace(/<ac:placeholder>[\s\S]*?<\/ac:placeholder>/g, ' ')
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

// A sentence that states a decision (used only when a page has no Decision or Outcome heading)
export const DECISION_SENTENCE = /\b(we will|we'll|we have decided|we've decided|we decided|a decision was made|we chose|we have chosen|we are going to|we adopt|we have adopted|is the standard|should be (named|used|on the following form)|must be used|we use)\b/i;

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
  // Confluence "Decision documentation" template: free text under the "Outcome" heading
  const sec = /<h[1-3][^>]*>(?:(?!<\/h[1-3]>)[\s\S])*?(Outcome|Decision)\s*<\/h[1-3]>([\s\S]*?)(?=<h[1-3]|$)/i.exec(html);
  const sectionText = sec ? stripTags(sec[2]) : '';
  // Options the team weighed: "Considered options", "Alternatives", "Options" sections
  const altRe = /<h[1-4][^>]*>((?:(?!<\/h[1-4]>)[\s\S])*?)<\/h[1-4]>([\s\S]*?)(?=<h[1-4]|$)/gi;
  const alternativesText = [];
  let am;
  while ((am = altRe.exec(html))) {
    if (/^\s*(considered (options|alternatives)|options considered|alternatives( considered)?|other options|rejected (options|alternatives)|options)\s*$/i.test(stripTags(am[1]))) alternativesText.push(stripTags(am[2]));
  }
  // No Decision/Outcome heading: read the first sentence that states a decision, plus the two after it
  let fallback = '';
  if (!sectionText) {
    const all = stripTags(html).split(/(?<=[.!?])\s+/);
    let i = all.findIndex((x) => DECISION_SENTENCE.test(x));
    // "a decision was made." only says that there is a decision: read what follows it
    if (i >= 0 && /a decision was made\.?\s*$/i.test(all[i])) i += 1;
    if (i >= 0 && i < all.length) fallback = all.slice(i, i + 3).join(' ');
  }
  return {
    pageId: page.id,
    key: idMatch ? idMatch[1] : null,
    title: page.title,
    url: page.url,
    status,
    active: !INACTIVE.test(status),
    outcome: fields.outcome || fields.decision || sectionText || fallback,
    alternatives: [fields['considered options'] || fields.alternatives || fields.options || '', ...alternativesText].filter(Boolean).join(' '),
    source: page.source || 'label',
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

// Pulls a short quote around the first match from the issue text, cut on word boundaries.
const quoteFrom = (raw, term) => {
  const r = String(raw || '');
  const words = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const idx = r.toLowerCase().indexOf(words[0] || '');
  if (idx < 0) return '';
  return quoteAround(r, idx, idx + term.length);
};

export const MIN_WORDS = 4;

// Inline Confluence decisions (/decision in the editor) are stored as
// <ac:adf-node type="decision-item"> with state DECIDED. Each one becomes its own decision.
export const decisionItemsFrom = (page) => {
  const out = [];
  const re = /<ac:adf-node type="decision-item">([\s\S]*?)<\/ac:adf-node>/g;
  let m;
  while ((m = re.exec(page.body || ''))) {
    const inner = m[1];
    const st = /<ac:adf-attribute key="state">([A-Z]+)<\/ac:adf-attribute>/.exec(inner);
    const id = /<ac:adf-attribute key="local-id">([^<]+)<\/ac:adf-attribute>/.exec(inner);
    const txt = /<ac:adf-content>([\s\S]*?)<\/ac:adf-content>/.exec(inner);
    const text = txt ? stripTags(txt[1]) : '';
    if (!text) continue;
    const decided = !st || st[1] === 'DECIDED';
    out.push({
      pageId: page.id, itemId: id ? id[1] : String(out.length), key: null,
      title: `${page.title}: ${text.length > 70 ? text.slice(0, 70).replace(/\s+\S*$/, '') + '...' : text}`,
      url: page.url, status: decided ? 'Decided' : 'Undecided', active: decided, outcome: text,
      applies: [], donot: [], instead: '', decidedOn: '', supersededBy: '', source: 'decision-item', lastUpdated: page.lastUpdated || null,
    });
  }
  return out;
};

const isTemplateDecision = (html) => /<ac:macro ac:name="details"|<ac:structured-macro[^>]*ac:name="details"/.test(html) && />\s*(?:<[^>]+>\s*)*Status\s*</i.test(html) && /Outcome/i.test(html);

// Turns one Confluence page into zero or more decisions, depending on how the team records them.
export const decisionsFromPage = (page) => {
  const html = page.body || '';
  const items = decisionItemsFrom(page);
  const labelled = page.labelled;
  const template = isTemplateDecision(html);
  const hasTable = /<th[^>]*>\s*(?:<[^>]+>\s*)*(Outcome|Do not|Decision)\s*</i.test(html);
  const list = [];
  if ((labelled || template || hasTable || page.titleMatch) && !/^template\b/i.test(page.title || '')) {
    const d = parseDecisionPage({ ...page, source: labelled ? 'label' : template ? 'template' : 'title' });
    if (d.outcome || d.donot.length) list.push(d);
  }
  return list.concat(items);
};

export const MIN_SCORE = 0.25;
export const MIN_DISTINCT = 2;

export const checkIssue = (issue, decisionsAll, opts = {}) => {
  const prs = (issue.linkedPRs || []).map((p) => `Linked pull request: ${p.title}.`).join(' ');
  const raw = `${issue.summary || ''}. ${issue.description || ''} ${prs} ${(issue.labels || []).filter((l) => !/^decision-(drift|reopen)/.test(l)).join(' ')}`.trim();
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
    possible: [],
    related: [],
  };
  if (decisionsAll.length === 0) {
    return { ...base, state: 'no-decisions', message: 'No decision records were found in Confluence (label, Decision template, inline decisions or the spaces set in Settings), so there is nothing to compare against.' };
  }
  if (words < MIN_WORDS) {
    return { ...base, state: 'insufficient', message: `This work item has only ${words} ${words === 1 ? 'word' : 'words'}. Add a description so it can be compared with decisions.` };
  }
  const lex = compileLexicon(opts.synonyms);
  const tokens = tokenize(raw);
  const mentions = findConcepts(tokens, lex);
  const scores = overlapScores(raw, active);
  for (const d of inactive) {
    const a = hits(text, d.applies);
    const x = hits(text, d.donot);
    if (a.length || x.length) base.ignoredInactive.push({ key: d.key, title: d.title, url: d.url, status: d.status, supersededBy: d.supersededBy });
  }
  active.forEach((d, i) => {
    const a = hits(text, d.applies);
    const x = hits(text, d.donot).filter((term) => literalNotNegated(tokens, term));
    const card = {
      key: d.key, pageId: d.pageId, itemId: d.itemId || null, title: d.title, url: d.url, status: d.status, source: d.source || 'label',
      outcome: d.outcome, instead: d.instead, decidedOn: d.decidedOn,
      matchedScope: a, matchedRule: x, score: Math.round(scores[i] * 100) / 100,
      evidence: x.length ? { rule: `Do not: ${x.join(', ')}`, issueQuote: quoteFrom(raw, x[0]) } : null,
    };
    if (x.length && opts.bans !== false) { base.conflicts.push(card); return; }
    if (!opts.experimental) return;
    const sem = semanticCheck(raw, tokens, mentions, compileDecision(d, lex));
    if (sem.level === 'possible') {
      base.possible.push({ ...card, evidence: { rule: sem.rule, issueQuote: sem.quote, readAs: sem.why } });
      return;
    }
    // a card from word overlap alone needs enough overlap AND at least MIN_DISTINCT words that only this decision uses
    const distinct = (scores.distinct && scores.distinct[i]) || [];
    const overlapCard = scores[i] >= MIN_SCORE && distinct.length >= MIN_DISTINCT;
    if (a.length || overlapCard || sem.followsInstead) {
      if (!a.length) card.matchedScope = sem.followsInstead ? ['matches the agreed alternative'] : [`text overlap ${Math.round(scores[i] * 100)}%, shared words only this decision uses: ${distinct.slice(0, 4).join(', ')}`];
      base.related.push(card);
    }
  });
  let state = 'clear';
  if (base.conflicts.length) state = 'conflict';
  else if (base.possible.length) state = 'possible-conflict';
  else if (base.related.length) state = 'needs-judgment';
  const name = (c) => c.key || c.title;
  const message = {
    conflict: `Conflicts with ${base.conflicts.map(name).join(', ')}. Each warning quotes the rule it breaks.`,
    'possible-conflict': `Possible conflict with ${base.possible.map(name).join(', ')}: the wording differs, but the same thing is described. Check the evidence or ask the agent.`,
    'needs-judgment': `Touches ${base.related.map(name).join(', ')} but no rule is broken. Ask the agent or read the decision before starting.`,
    clear: opts.experimental ? `No active decision covers this work item (${active.length} decisions checked).` : `None of the ${active.length} active decisions bans anything this work item names. The meaning-based check is experimental and off.`,
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

export const noConfluence = (issueKey, err) => ({
  issueKey, checkedAt: new Date().toISOString(), decisionCount: 0, ignoredInactive: [], conflicts: [], related: [],
  possible: [], state: 'no-confluence',
  message: `Could not read Confluence on this site, so nothing was compared. Connect the app to Confluence (Apps > Manage apps). Details: ${String(err && err.message || err).slice(0, 120)}`,
});
