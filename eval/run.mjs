// Measures the code-only matcher on the two test sets. Usage: node eval/run.mjs
// Decisions: the 7 sample decision pages (storage format) in eval/site_pages.json.
import fs from 'fs'; import path from 'path'; import url from 'url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const build = path.join(here, '.build'); fs.mkdirSync(build, { recursive: true });
fs.copyFileSync(path.join(here, '../src/lib/match.js'), path.join(build, 'match.mjs'));
fs.writeFileSync(path.join(build, 'core.mjs'), fs.readFileSync(path.join(here, '../src/lib/core.js'), 'utf8').replace("from './match'", "from './match.mjs'"));
const core = await import(path.join(build, 'core.mjs'));
const pages = JSON.parse(fs.readFileSync(path.join(here, 'site_pages.json')));
for (const [file, mode] of [['paraphrase_set.json', 'structured'], ['paraphrase_set.json', 'sentence'], ['holdout_set.json', 'structured'], ['holdout_set.json', 'sentence']]) {
  const cases = JSON.parse(fs.readFileSync(path.join(here, file))).cases;
  const decs = pages.flatMap((p) => mode === 'sentence'
    ? [{ ...core.parseDecisionPage(p), applies: [], donot: [], instead: '' }]
    : core.decisionsFromPage({ ...p, labelled: true }));
  let tp = 0, pos = 0, fp = 0, neg = 0; const miss = [], wrong = [];
  for (const c of cases) {
    const r = core.checkIssue({ key: c.id, summary: c.s, description: c.d }, decs);
    const flagged = [...r.conflicts, ...r.possible].map((x) => x.key);
    if (c.expect) { pos++; if (flagged.includes(c.expect)) tp++; else miss.push(c.id); } else { neg++; if (flagged.length) { fp++; wrong.push(c.id); } }
  }
  console.log(`${file} [${mode}] caught ${tp}/${pos}, false flags ${fp}/${neg}${miss.length ? ' missed ' + miss.join(',') : ''}${wrong.length ? ' false ' + wrong.join(',') : ''}`);
}
