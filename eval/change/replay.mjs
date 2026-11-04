// Replays every committed version of every ADR file in Backstage and Cosmos SDK through the
// app's change rules (src/lib/change.js), pair by pair, and lists what it would have said.
import fs from 'fs';
import { md2html } from './md2html.mjs';
fs.copyFileSync(new URL('../../src/lib/change.js', import.meta.url), new URL('./.build/change.mjs', import.meta.url));
const C = await import('./.build/change.mjs');
// Data folder made by history_fetch.py (versions/ and versions.json). Default: this folder.
const ROOT = process.env.DDG_HISTORY || new URL('./', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(ROOT + 'versions.json', 'utf8'));
const out = { pairs: 0, files: 0, byKind: {}, retired: [], changedSample: [], perRepo: {} };
for (const [key, vers] of Object.entries(meta)) {
  out.files++;
  const repo = key.split('/').slice(0, 2).join('/');
  out.perRepo[repo] = out.perRepo[repo] || { files: 0, pairs: 0, retired: 0, changed: 0, ignored: 0 };
  out.perRepo[repo].files++;
  for (let i = 1; i < vers.length; i++) {
    const a = md2html(fs.readFileSync(ROOT + vers[i - 1].file, 'utf8'));
    const b = md2html(fs.readFileSync(ROOT + vers[i].file, 'utf8'));
    const r = C.compareVersions(a, b);
    out.pairs++; out.perRepo[repo].pairs++; out.perRepo[repo][r.kind]++;
    out.byKind[r.kind] = (out.byKind[r.kind] || 0) + 1;
    const row = { file: key, commit: vers[i].url, date: vers[i].date, msg: vers[i].msg, kind: r.kind, from: r.fromStatus, to: r.toStatus, replacement: r.replacement, removed: r.removed.length, added: r.added.length };
    if (r.kind === 'retired') out.retired.push(row);
    else if (r.kind === 'changed' && out.changedSample.length < 400) out.changedSample.push(row);
  }
}
fs.writeFileSync(ROOT + 'replay_result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ files: out.files, pairs: out.pairs, byKind: out.byKind, perRepo: out.perRepo }));
out.retired.forEach((r) => console.log('RETIRED', r.file, r.date.slice(0, 10), r.from, '->', r.to, '|', r.msg.slice(0, 60)));
