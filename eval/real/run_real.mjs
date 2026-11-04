// One-shot evaluation on third-party data: Backstage ADRs (Apache-2.0) vs real GitHub issues/PRs.
// Ground truth: a human comment on the item links the ADR (labels.json, frozen before this run).
import fs from 'fs'; import path from 'path';
const appLib = new URL('../../src/lib', import.meta.url).pathname;
const b = path.resolve('.build'); fs.mkdirSync(b, { recursive: true });
fs.copyFileSync(`${appLib}/match.js`, `${b}/match.mjs`);
fs.writeFileSync(`${b}/core.mjs`, fs.readFileSync(`${appLib}/core.js`, 'utf8').replace("from './match'", "from './match.mjs'"));
const core = await import(`${b}/core.mjs`);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pages = fs.readdirSync('adr').filter((f) => /^adr0(0[2-9]|1[0-5])/.test(f)).map((f) => {
  const md = fs.readFileSync(`adr/${f}`, 'utf8');
  const num = f.slice(3, 6);
  const title = /^title: '?(.*?)'?$/m.exec(md)[1].replace(/^ADR\d+:\s*/, '').replace(/\[superseded\]\s*/i, '');
  const sec = (/## Decision\s*\n([\s\S]*?)(?=\n## |$)/.exec(md) || [, ''])[1]
    .replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '');
  const body = `<h2>Decision</h2>${sec.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('')}`;
  return { id: num, title: `ADR-${num}: ${title}`, url: `https://github.com/backstage/backstage/blob/master/docs/architecture-decisions/${f}`, body, labelled: true };
});
const decs = pages.flatMap((p) => core.decisionsFromPage(p)).map((d) => ({ ...d, active: true }));
const L = JSON.parse(fs.readFileSync('labels.json'));
const cands = JSON.parse(fs.readFileSync('candidates.json'));
const negs = JSON.parse(fs.readFileSync('negatives.json'));
const clean = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, ' ');
const res = { pos: [], neg: [] };
for (const o of cands) { const exp = L.positives[o.n]; if (!exp) continue;
  const r = core.checkIssue({ key: '#' + o.n, summary: o.title, description: clean(o.body) }, decs, { experimental: true });
  const want = exp.map((x) => 'ADR-' + x);
  const fl = [...r.conflicts, ...r.possible].map((x) => x.key), rel = r.related.map((x) => x.key);
  res.pos.push({ n: o.n, want, state: r.state, flagged: fl, related: rel, hitFlag: fl.some((k) => want.includes(k)), hitAny: [...fl, ...rel].some((k) => want.includes(k)), wrongFlag: fl.filter((k) => !want.includes(k)) });
}
for (const o of negs) {
  const r = core.checkIssue({ key: '#' + o.n, summary: o.title, description: clean(o.body) }, decs, { experimental: true });
  res.neg.push({ n: o.n, state: r.state, flagged: [...r.conflicts, ...r.possible].map((x) => x.key), related: r.related.map((x) => x.key) });
}
const P = res.pos.length, N = res.neg.length, c = (a, f) => a.filter(f).length;
const sum = { decisions: decs.length, positives: P, caughtFlag: c(res.pos, (x) => x.hitFlag), caughtAnyCard: c(res.pos, (x) => x.hitAny), posWrongFlag: c(res.pos, (x) => x.wrongFlag.length), negatives: N, negFlagged: c(res.neg, (x) => x.flagged.length), negAnyCard: c(res.neg, (x) => x.flagged.length || x.related.length) };
fs.writeFileSync('result_real.json', JSON.stringify({ sum, ...res }, null, 1));
console.log(JSON.stringify(sum));
