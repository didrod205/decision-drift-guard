// Decision Drift Guard: paraphrase-aware matcher. Pure code, no LLM.
// A decision becomes a set of "rules". Each rule is a set of concepts that, together,
// describe something the team said it will not do. A work item that mentions every
// concept of a rule (not negated) is a "possible conflict"; the evidence lists which
// words were read as which concept, so a person can check it in seconds.

// phrase -> concepts. Words are stemmed at load, so plurals and -ed/-ing forms match.
const BASE_LEXICON = {
  store: ['store', 'save', 'cache', 'persist', 'keep', 'kept', 'remember', 'retain', 'prefill', 'pre fill', 'pre filled', 'write to disk'],
  device: ['device', 'on device', 'locally', 'local', 'local storage', 'localstorage', 'keychain', 'keystore', 'disk', 'phone', 'client side', 'shared preferences', 'userdefaults'],
  card: ['card', 'credit card', 'debit card', 'card number', 'card details', 'cvv', 'cvc', 'pan', 'payment card'],
  sms: ['sms', 'text message', 'by text', 'via text', 'over text', 'texted', 'texting', 'text'],
  otp: ['otp', 'one time code', 'one time password', 'one time passcode', 'passcode', 'verification code', '6 digit code', 'six digit code', 'pin', 'code'],
  thirdparty: ['third party', '3rd party', 'external', 'vendor'],
  analytics: ['analytics', 'tracking', 'track', 'funnel', 'telemetry', 'metrics', 'events', 'heatmap', 'click map'],
  sdk: ['sdk', 'library', 'plugin', 'integrate', 'integration', 'install'],
  replay: ['session replay', 'session recording', 'record sessions', 'record user sessions', 'screen recording', 'record the screen', 'heatmap', 'click map'],
  hardcoded: ['hardcoded', 'hard coded', 'hardcode', 'build time', 'compile time', 'build config', 'build configuration', 'constant', 'if statement'],
  flag: ['flag', 'toggle', 'switch', 'feature flag', 'kill switch', 'if statement'],
  offline: ['offline', 'no network', 'no connection', 'no internet', 'without internet', 'without network', 'without an internet connection', 'without a connection', 'airplane mode', 'not connected'],
  pay: ['payment', 'pay', 'checkout', 'purchase', 'buy', 'charge', 'order', 'billing'],
};
// product names imply several concepts at once
const VENDORS = {
  'mixpanel|amplitude|segment|google analytics|firebase analytics|appsflyer|heap|posthog|adjust|branch': ['thirdparty', 'analytics', 'sdk'],
  'hotjar|fullstory|smartlook|logrocket|uxcam|clarity': ['thirdparty', 'analytics', 'sdk', 'replay'],
  'build flag|compile flag|build time flag': ['hardcoded', 'flag'],
};
// Small fixed list of tools that compete for the same job. Only common categories; a team adds
// its own pairs through the settings page instead of this list growing.
export const COMPETING = {
  'date library': ['moment', 'moment js', 'luxon', 'date fns', 'dayjs', 'day js'],
  'state management': ['redux', 'mobx', 'mobx state tree', 'zustand', 'recoil', 'jotai', 'xstate', 'vuex', 'pinia', 'ngrx'],
  'test runner': ['jest', 'mocha', 'vitest', 'jasmine', 'ava', 'karma'],
  'package manager': ['npm', 'yarn', 'pnpm'],
  'HTTP client': ['axios', 'node fetch', 'cross fetch', 'isomorphic fetch', 'superagent', 'ky'],
  bundler: ['webpack', 'rollup', 'vite', 'esbuild', 'parcel'],
  'CSS-in-JS': ['styled components', 'emotion', 'jss'],
};
const phraseToks = (p) => String(p).split(/[^A-Za-z0-9]+/).filter(Boolean).map(stem);
const findPhrase = (tokens, toks, wantNeg) => {
  for (let i = 0; i + toks.length <= tokens.length; i++) {
    if (toks.every((x, k) => tokens[i + k].s === x) && (wantNeg === undefined || tokens[i].neg === wantNeg)) return i;
  }
  return -1;
};
const CHOICE = /\b(use|uses|used|using|adopt|adopted|standard|chose|choose|chosen|prefer|go with|switch to|move to|migrate to|select|selected|mocked by)\b/i;
const AGAINST = /\b(?:instead of|rather than|in favou?r of [^.]*? over|over|replac(?:e|es|ing) |move away from|get rid of|not)\s+(?:the\s+|using\s+|a\s+)?([A-Za-z][A-Za-z0-9.\-]*(?:\s+[A-Za-z][A-Za-z0-9.\-]*){0,2})/gi;

// "Use X" decisions: what was chosen, and the options it was chosen over.
export const competingFrom = (outcome, alternatives) => {
  const toks = tokenize(outcome || '');
  const sentences = String(outcome || '').split(/(?<=[.!?])\s+|\n+/);
  const names = [];
  for (const [cat, list] of Object.entries(COMPETING)) list.forEach((p) => names.push({ cat, p, toks: phraseToks(p) }));
  names.sort((a, b) => b.toks.length - a.toks.length);
  const inText = (text) => { const t = tokenize(text); const got = []; const used = new Set();
    for (const n of names) { const i = findPhrase(t, n.toks); if (i >= 0 && !used.has(i)) { used.add(i); got.push(n); } } return got; };
  // chosen = a listed tool that is the object of a choice verb ("use Luxon", "use the node-fetch package")
  let chosen = [];
  const FILL = new Set(['the', 'a', 'an', 'native', 'standard']);
  for (const sent of sentences) {
    if (!CHOICE.test(sent)) continue;
    const t = tokenize(sent.split(/\b(?:instead of|rather than|over|not)\b/i)[0]);
    for (let i = 0; i < t.length && !chosen.length; i++) {
      if (!CHOICE.test(t[i].w) && !(t[i].w === 'by' && t[i + 1] && t[i + 1].w === 'using')) continue;
      let j = i + 1; if (t[j] && t[j].w === 'using') j++;
      let skip = 0; while (t[j] && FILL.has(t[j].w) && skip < 2) { j++; skip++; }
      const src = sent.split(/\b(?:instead of|rather than|over|not)\b/i)[0];
      for (const n of names) if (n.toks.every((x, k) => t[j + k] && t[j + k].s === x)) { chosen = [{ ...n, shown: src.slice(t[j].start, t[j + n.toks.length - 1].end) }]; break; }
    }
    if (chosen.length) break;
  }
  if (!chosen.length) return null;
  const chosenSet = new Set(chosen.map((c) => c.p));
  const out = new Map();
  const add = (p, why) => { const k = phraseToks(p).join(' '); if (!k || chosen.some((c) => c.toks.join(' ') === k) || out.has(k)) return; out.set(k, { phrase: p, toks: phraseToks(p), why }); };
  const cats = new Set(chosen.map((c) => c.cat));
  for (const n of names) if (cats.has(n.cat) && !chosenSet.has(n.p)) add(n.p, `another ${n.cat}`);
  const altText = `${outcome || ''} ${alternatives || ''}`;
  let m;
  AGAINST.lastIndex = 0;
  while ((m = AGAINST.exec(altText))) {
    const words = m[1].split(/\s+/).filter((w) => !STOP.has(w.toLowerCase()));
    if (!words.length) continue;
    const named = inText(m[1]);
    if (named.length) named.forEach((n) => add(n.p, 'named in the decision as the option not taken'));
    else if (words.length <= 2 && words.join(' ').length >= 4 && /[A-Z.\-]|js$/.test(words.join(' '))) add(words.join(' '), 'named in the decision as the option not taken');
  }
  for (const n of inText(alternatives || '')) add(n.p, 'listed under the options the decision considered');
  void toks;
  return { chosen: chosen.map((c) => c.shown || c.p), category: [...cats].join(', '), competitors: [...out.values()] };
};

const ARTICLE = new Set(['the', 'a', 'an', 'this', 'that', 'at', 'one', 'every', 'any', 'each', 'some']);
const VERB_CONCEPTS = new Set(['store']);
const NEGATORS = new Set(['no', 'not', 'never', 'without', 'remov', 'drop', 'stop', 'avoid', 'instead', 'disabl', 'delet', 'block', 'prevent', 'ban', 'forbid', 'don', 'doesn', 'didn', 'won', 'isn', 'aren', 'cannot', 'deprecat', 'uninstall', 'replac', 'migrat', 'rid', 'away']);
const BREAKS = new Set(['and', 'but', 'then', 'so', 'when', 'while', 'because', 'for', 'to', 'so', 'if', 'or', 'with']);
const STOP = new Set('a an the of to in on for with and or but is are be by at as it its this that from we our us you your they them their can will should would must not no do does new add use using make let all any so than then into out up about more less only also just via over per each every when while after before there here what which who how get got set has have had was were'.split(' '));

export const stem = (w) => {
  let s = String(w).toLowerCase();
  if (s.length > 4) {
    if (s.endsWith('ing')) s = s.slice(0, -3);
    else if (s.endsWith('ies')) s = s.slice(0, -3) + 'y';
    else if (s.endsWith('es')) s = s.slice(0, -2);
    else if (s.endsWith('ed')) s = s.slice(0, -2);
    else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  }
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
};

// Tokens with character offsets, plus where clauses break (punctuation).
export const tokenize = (raw) => {
  const out = [];
  const re = /[A-Za-z0-9]+/g;
  let m; let last = 0;
  const r = String(raw || '');
  while ((m = re.exec(r))) {
    const gap = r.slice(last, m.index);
    out.push({ w: m[0].toLowerCase(), s: stem(m[0]), start: m.index, end: m.index + m[0].length, brk: /[.,;:!?()\n]/.test(gap) });
    last = m.index + m[0].length;
  }
  // negation scope: a negator covers the following words up to a clause break, at most 6 words
  let left = 0;
  for (const t of out) {
    if (t.brk || BREAKS.has(t.w)) left = 0;
    t.neg = left > 0;
    if (left > 0) left--;
    if (NEGATORS.has(t.s) || NEGATORS.has(t.w)) left = 6;
  }
  return out;
};

export const compileLexicon = (extraText) => {
  const entries = [];
  const add = (phrase, concepts) => {
    const toks = String(phrase).split(/[^A-Za-z0-9]+/).filter(Boolean).map(stem);
    if (toks.length) entries.push({ phrase: String(phrase), toks, concepts });
  };
  for (const [c, list] of Object.entries(BASE_LEXICON)) list.forEach((p) => add(p, [c]));
  for (const [alts, cs] of Object.entries(VENDORS)) alts.split('|').forEach((p) => add(p, cs));
  // team synonyms from settings, one per line: "concept: word, word"
  String(extraText || '').split('\n').forEach((line) => {
    const m = /^\s*([A-Za-z0-9 -]+?)\s*[:=]\s*(.+)$/.exec(line);
    if (!m) return;
    const c = m[1].trim().toLowerCase().replace(/\s+/g, '-');
    add(m[1], [c]);
    m[2].split(',').map((x) => x.trim()).filter(Boolean).forEach((p) => add(p, [c]));
  });
  entries.sort((a, b) => b.toks.length - a.toks.length);
  return entries;
};

// Finds concept mentions. Longest phrase wins; a mention is negated if its first word is.
export const findConcepts = (tokens, lex) => {
  const used = new Array(tokens.length).fill(false);
  const found = [];
  for (const e of lex) {
    const n = e.toks.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      let ok = true;
      for (let k = 0; k < n; k++) if (used[i + k] || tokens[i + k].s !== e.toks[k]) { ok = false; break; }
      if (!ok) continue;
      for (let k = 0; k < n; k++) used[i + k] = true;
      found.push({ concepts: e.concepts, i, n, neg: tokens[i].neg, start: tokens[i].start, end: tokens[i + n - 1].end });
    }
  }
  return found.sort((a, b) => a.i - b.i);
};

const conceptSet = (text, lex) => {
  const f = findConcepts(tokenize(text), lex).filter((x) => !x.neg);
  return new Set(f.flatMap((x) => x.concepts));
};
const contentStems = (text) => tokenize(text).filter((t) => !STOP.has(t.w) && t.w.length > 2 && !/^\d+$/.test(t.w)).map((t) => t.s);

// Prohibition clauses in a free sentence: "never X", "do not X", "no X", "X are not used", "X stay online-only".
export const prohibitionsFrom = (sentenceText) => {
  const out = [];
  const sentences = String(sentenceText || '').split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    let m;
    const re1 = /\b(?:never|do not|does not|don't|doesn't|will not|won't|must not|may not|should not|shouldn't|avoid|avoid using|cannot|can't|are not allowed to|is not allowed to)\s+(.+?)(?:[.;]|$)/gi;
    while ((m = re1.exec(s))) out.push({ clause: m[1], sentence: s.trim() });
    const re1b = /\b(?:stop using|stop|no longer use)\s+(.+?)(?:[.;]|$)/gi;
    while ((m = re1b.exec(s))) out.push({ clause: m[1], sentence: s.trim() });
    const re1c = /^(.+?)\s+should be avoided\b/i.exec(s);
    if (re1c) out.push({ clause: re1c[1].replace(/^.*\bthat\s+/i, ''), sentence: s.trim() });
    const re2 = /\bno\s+(.+?)(?:[.;]|$)/gi;
    while ((m = re2.exec(s))) out.push({ clause: m[1], sentence: s.trim() });
    const re3 = /^(.+?)\s+(?:are|is)\s+not\s+(?:used|allowed|permitted|accepted|supported)\b/i.exec(s);
    if (re3) out.push({ clause: re3[1], sentence: s.trim() });
    const re4 = /^(.+?)\s+(?:stay|stays|remain|remains|are|is)\s+online[- ]only/i.exec(s);
    if (re4) out.push({ clause: `offline ${re4[1]}`, sentence: s.trim(), offline: true });
  }
  return out;
};

// Minimum versions: "iOS 16 or later", "Android 10 or higher", "API level 29+"
const VERSION_RE = /\b(ios|android|ipados|macos|watchos|api level|node(?:\.js)?|python|java|chrome)\s*(\d+(?:\.\d+)?)\s*(?:\+|or later|or higher|or newer|or above|and later|and above|and newer)/gi;
export const minVersionsFrom = (text) => {
  const out = [];
  let m;
  while ((m = VERSION_RE.exec(String(text || '')))) out.push({ tech: m[1].toLowerCase(), min: parseFloat(m[2]), quote: m[0] });
  return out;
};

// Builds the rules for one decision (structured "Do not" rows and/or the outcome sentence).
export const compileDecision = (d, lex) => {
  const rules = [];
  const insteadConcepts = conceptSet(d.instead || '', lex);
  const pushRule = (concepts, label, fromText) => {
    if (/\d/.test(fromText) && minVersionsFrom(`${fromText} or later`).length) return; // version rules are handled as numbers
    if (concepts.size === 1) {
      // one concept alone is weak: also require the other content words of the phrase
      const covered = new Set(findConcepts(tokenize(fromText), lex).flatMap((f) => tokenize(fromText.slice(f.start, f.end)).map((t) => t.s)));
      const extra = [...new Set(contentStems(fromText))].filter((x) => !covered.has(x));
      if (extra.length) { rules.push({ concepts, stems: extra, label, markers: new Set(), mixed: true }); return; }
    }
    if (!concepts.size) {
      const stems = [...new Set(contentStems(fromText))].sort((a, b) => b.length - a.length).slice(0, 3);
      if (stems.length >= 2) rules.push({ concepts: new Set(), stems, label, markers: new Set() });
      return;
    }
    const markers = new Set([...concepts].filter((c) => !insteadConcepts.has(c)));
    const key = [...concepts].sort().join('+');
    if (!rules.some((r) => [...r.concepts].sort().join('+') === key)) rules.push({ concepts, stems: [], label, markers });
  };
  for (const p of d.donot || []) pushRule(conceptSet(p, lex), `Do not: ${p}`, p);
  for (const pr of prohibitionsFrom(d.outcome || '')) {
    const parts = pr.clause.split(/,|\bor\b|\band\b/i).map((x) => x.trim()).filter(Boolean);
    const whole = conceptSet(pr.clause, lex);
    const verbs = [...whole].filter((c) => VERB_CONCEPTS.has(c));
    const quote = `"${pr.sentence}"`;
    let any = false;
    for (const part of parts) {
      const cs = conceptSet(part, lex);
      if (!cs.size) continue;
      verbs.forEach((v) => cs.add(v));
      if (pr.offline) cs.add('offline');
      any = true;
      pushRule(cs, quote, part);
    }
    if (!any) pushRule(whole, quote, pr.clause);
  }
  return {
    rules,
    competing: competingFrom(d.outcome || '', d.alternatives || ''),
    minVersions: minVersionsFrom(`${d.outcome || ''} ${(d.donot || []).join(', ')}`),
    scopeConcepts: conceptSet((d.applies || []).join(', '), lex),
    scopeTerms: (d.applies || []).map((a) => a.toLowerCase()),
    termConcepts: Object.fromEntries((d.applies || []).map((a) => [a.toLowerCase(), conceptSet(a, lex)])),
    insteadStems: new Set(contentStems(d.instead || '')),
  };
};

const cut = (raw, start, end) => {
  // quote that starts and ends on word boundaries, about 120 characters around the match
  const r = String(raw || '');
  let a = Math.max(0, start - 40);
  let b = Math.min(r.length, end + 70);
  if (a > 0) { const sp = r.lastIndexOf(' ', start); a = sp >= a - 20 && sp >= 0 ? sp + 1 : a; while (a > 0 && /\w/.test(r[a - 1])) a--; }
  if (b < r.length) { const sp = r.indexOf(' ', b); b = sp > 0 && sp < b + 20 ? sp : b; while (b < r.length && /\w/.test(r[b])) b++; }
  return (a > 0 ? '...' : '') + r.slice(a, b).trim() + (b < r.length ? '...' : '');
};
export const quoteAround = cut;

// Returns { level: 'possible' | null, ... } for one compiled decision against a work item.
export const semanticCheck = (raw, tokens, mentions, compiled) => {
  const present = new Map(); // concept -> first non-negated mention
  for (const m of mentions) if (!m.neg) m.concepts.forEach((c) => { if (!present.has(c)) present.set(c, m); });
  const stemsPresent = new Set(tokens.filter((t) => !t.neg).map((t) => t.s));
  const issueStems = [...new Set(contentStems(raw))];
  const insteadOverlap = issueStems.length ? issueStems.filter((s) => compiled.insteadStems.has(s)).length / issueStems.length : 0;
  const lower = ` ${raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  // scope counts only if it comes from a word other than the matched markers
  const scopeHit = (exclude) =>
    compiled.scopeTerms.some((t) => {
      if (!lower.includes(` ${t.replace(/[^a-z0-9]+/g, ' ').trim()} `)) return false;
      const cs = compiled.termConcepts[t] || new Set();
      return !cs.size || [...cs].some((c) => !exclude.has(c));
    }) || [...compiled.scopeConcepts].some((c) => present.has(c) && !exclude.has(c));
  const out = { level: null, why: [], rule: null, quote: '', insteadOverlap };
  // 1. minimum version below the decided floor
  for (const mv of compiled.minVersions) {
    const re = new RegExp(`\\b${mv.tech.replace('.', '\\.')}\\s*(\\d+(?:\\.\\d+)?)`, 'gi');
    let m;
    while ((m = re.exec(raw))) {
      const tok = tokens.find((t) => t.start >= m.index);
      if (tok && tok.neg) continue;
      if (parseFloat(m[1]) < mv.min) {
        return { ...out, level: 'possible', rule: `Minimum is ${mv.quote}`, quote: cut(raw, m.index, m.index + m[0].length), why: [`${m[0]} is below ${mv.min}`] };
      }
    }
  }
  if (insteadOverlap >= 0.5) return { ...out, followsInstead: true };
  // 1b. the decision chose X; the work item brings in a competing option (not "remove"/"replace" it)
  if (compiled.competing) {
    for (const c of compiled.competing.competitors) {
      let i = -1;
      for (let k = 0; k + c.toks.length <= tokens.length; k++) {
        if (!c.toks.every((x, q) => tokens[k + q].s === x) || tokens[k].neg) continue;
        if (k > 0 && ARTICLE.has(tokens[k - 1].w) && c.toks.length === 1) continue; // "at the moment", "an emotion"
        i = k; break;
      }
      if (i < 0) continue;
      const t0 = tokens[i]; const t1 = tokens[i + c.toks.length - 1];
      const ch = compiled.competing.chosen.join(' / ');
      return { ...out, level: 'possible', competing: true, rule: `The decision chose ${ch}; ${c.phrase} is ${c.why}`, quote: cut(raw, t0.start, t1.end), why: [`"${raw.slice(t0.start, t1.end)}" is ${c.why} (decision chose ${ch})`] };
    }
  }
  // 2. concept rules
  for (const r of compiled.rules) {
    if (r.stems.length) {
      if (r.stems.every((s) => stemsPresent.has(s)) && [...r.concepts].every((c) => present.has(c))) {
        const t = tokens.find((x) => x.s === r.stems[0] && !x.neg);
        const cw = [...r.concepts].map((c) => present.get(c)).map((u) => `"${raw.slice(u.start, u.end)}" read as ${u.concepts.join('/')}`);
        return { ...out, level: 'possible', rule: r.label, quote: cut(raw, t.start, t.end), why: cw.concat(r.stems.map((x) => `same word "${x}"`)) };
      }
      continue;
    }
    const all = [...r.concepts].every((c) => present.has(c));
    const markersOnly = !all && r.markers.size > 0 && r.markers.size < r.concepts.size && [...r.markers].every((c) => present.has(c)) && scopeHit(r.markers);
    if (all || markersOnly) {
      const used = [...r.concepts].filter((c) => present.has(c)).map((c) => present.get(c));
      const first = used.reduce((a, b) => (a.start <= b.start ? a : b));
      const lastEnd = Math.max(...used.map((u) => u.end));
      const why = [...new Map(used.map((u) => [u.start, u])).values()].map((u) => `"${raw.slice(u.start, u.end)}" read as ${u.concepts.join('/')}`);
      return { ...out, level: 'possible', partial: markersOnly, rule: r.label, quote: cut(raw, first.start, Math.min(lastEnd, first.start + 60)), why };
    }
  }
  return out;
};

// TF-IDF style overlap (0..1) between the work item and each decision, for ranking "related".
export const overlapScores = (raw, decisions) => {
  const docs = decisions.map((d) => contentStems(`${d.title} ${d.outcome} ${(d.applies || []).join(' ')} ${(d.donot || []).join(' ')}`));
  const df = new Map();
  docs.forEach((ws) => new Set(ws).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length || 1;
  const idf = (w) => Math.log(1 + N / (df.get(w) || N));
  const q = new Set(contentStems(raw));
  const scores = docs.map((ws) => {
    const set = new Set(ws);
    let num = 0; let den = 0;
    set.forEach((w) => { const x = idf(w); den += x; if (q.has(w)) num += x; });
    return den ? num / den : 0;
  });
  // words the work item shares with only this decision (not with the other decisions)
  scores.distinct = docs.map((ws) => [...new Set(ws)].filter((w) => q.has(w) && w.length > 3 && df.get(w) === 1 && !STOP.has(w)));
  return scores;
};

// True if the phrase appears in the text at least once outside a negation ("remove the X", "without X").
export const literalNotNegated = (tokens, phrase) => {
  const st = String(phrase).split(/[^A-Za-z0-9]+/).filter(Boolean).map(stem);
  if (!st.length) return false;
  for (let i = 0; i + st.length <= tokens.length; i++) {
    if (st.every((x, k) => tokens[i + k].s === x || tokens[i + k].s === stem(x + 's')) && !tokens[i].neg) return true;
  }
  return false;
};
