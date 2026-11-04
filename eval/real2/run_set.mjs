// Runs the app's own matcher (app/src/lib) on one ADR set and frozen labels.
// Each ADR markdown file becomes a Confluence-like page (headings and paragraphs, code blocks dropped),
// so the app itself decides what the decision text is (Decision heading, or first decision sentence).
// usage: node run_set.mjs <setDir> <adrDir> <adrUrlBase> <idRegex> <outFile> [linkedPRs.json]
import fs from 'fs'; import path from 'path';
const [setDir, adrDir, urlBase, idRe, outFile, prFile] = process.argv.slice(2);
const appLib = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/lib');
const b = path.resolve(setDir, '.build'); fs.mkdirSync(b, { recursive: true });
fs.copyFileSync(`${appLib}/match.js`, `${b}/match.mjs`);
fs.writeFileSync(`${b}/core.mjs`, fs.readFileSync(`${appLib}/core.js`, 'utf8').replace("from './match'", "from './match.mjs'"));
const core = await import(`${b}/core.mjs?${Date.now()}`);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdToHtml = (md) => md.replace(/^---[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '\n').split(/\n\s*\n/).map((blk) => {
  const t = blk.trim(); if (!t) return '';
  const h = /^(#{1,4})\s+(.*)$/.exec(t.split('\n')[0]);
  const clean = (x) => esc(x.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '').replace(/\*\*/g, ''));
  if (h) { const rest = t.split('\n').slice(1).join(' '); return `<h${h[1].length}>${clean(h[2])}</h${h[1].length}>` + (rest ? `<p>${clean(rest)}</p>` : ''); }
  return `<p>${clean(t.replace(/\n/g, ' '))}</p>`;
}).join('');
const re = new RegExp(idRe, 'i');
const pages = fs.readdirSync(adrDir).filter((f) => re.test(f)).sort().map((f) => {
  const md = fs.readFileSync(path.join(adrDir, f), 'utf8');
  const id = re.exec(f)[1];
  const tm = /^title:\s*'?(.*?)'?\s*$/m.exec(md) || /^#\s+(.*)$/m.exec(md);
  const title = (tm ? tm[1] : f).replace(/^ADR[-\s]?\d+:?\s*/i, '').replace(/\[superseded\]\s*/i, '');
  return { id, title: `ADR-${id}: ${title}`, url: urlBase + f, body: mdToHtml(md), labelled: true };
});
const decs = pages.flatMap((p) => core.decisionsFromPage(p)).map((d) => ({ ...d, active: true }));
const L = JSON.parse(fs.readFileSync(path.join(setDir, 'labels.json')));
const cands = JSON.parse(fs.readFileSync(path.join(setDir, 'candidates.json')));
const negs = JSON.parse(fs.readFileSync(path.join(setDir, 'negatives.json')));
const prs = prFile ? JSON.parse(fs.readFileSync(prFile)) : {};
const clean = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, ' ');
const res = { pos: [], neg: [] };
const run = (o) => core.checkIssue({ key: '#' + o.n, summary: o.title, description: clean(o.body), linkedPRs: prs[o.n] || [] }, decs, { experimental: !process.env.DDG_BANS_ONLY });
for (const o of cands) { const exp = L.positives[o.n]; if (!exp) continue;
  const r = run(o); const want = exp.map((x) => 'ADR-' + x);
  const fl = [...r.conflicts, ...r.possible].map((x) => x.key), rel = r.related.map((x) => x.key);
  res.pos.push({ n: o.n, want, state: r.state, flagged: fl, related: rel, relScores: r.related.map((x) => [x.key, x.score, x.matchedScope]), hitFlag: fl.some((k) => want.includes(k)), hitAny: [...fl, ...rel].some((k) => want.includes(k)), wrongFlag: fl.filter((k) => !want.includes(k)), ev: [...r.conflicts, ...r.possible].map((x) => x.evidence && x.evidence.rule) });
}
for (const o of negs) { const r = run(o);
  res.neg.push({ n: o.n, state: r.state, flagged: [...r.conflicts, ...r.possible].map((x) => x.key), related: r.related.map((x) => x.key), relScores: r.related.map((x) => [x.key, x.score]), ev: [...r.conflicts, ...r.possible].map((x) => x.evidence && x.evidence.rule) });
}
const P = res.pos.length, N = res.neg.length, c = (a, f) => a.filter(f).length;
const sum = { adrs: pages.length, decisionsRead: decs.length, decisionKeys: decs.map((d) => d.key), positives: P, caughtFlag: c(res.pos, (x) => x.hitFlag), caughtAnyCard: c(res.pos, (x) => x.hitAny), posWrongFlag: c(res.pos, (x) => x.wrongFlag.length), negatives: N, negFlagged: c(res.neg, (x) => x.flagged.length), negAnyCard: c(res.neg, (x) => x.flagged.length || x.related.length) };
fs.writeFileSync(outFile, JSON.stringify({ sum, decisions: decs.map((d) => ({ key: d.key, outcome: d.outcome.slice(0, 300), alternatives: (d.alternatives || '').slice(0, 200) })), ...res }, null, 1));
console.log(JSON.stringify(sum));
