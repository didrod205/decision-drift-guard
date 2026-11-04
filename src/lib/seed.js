import api, { route } from '@forge/api';
import { getFlag, setFlag, getSettings, saveSettings } from './store';

// One click sample data for judges and first-time users. Runs as the signed-in admin,
// so it can only create what that person could create by hand.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const row = (k, v) => `<tr><th><p>${k}</p></th><td><p>${esc(v)}</p></td></tr>`;

// three recording styles, so every way of finding decisions is shown
const PAGES = [
  {
    title: 'DEC-101: Card data never stored on the device', label: 'decision',
    body: `<h2>Decision summary</h2><table><tbody>${row('Status', 'Decided')}${row('Outcome', 'The app never stores card numbers or CVV on the device. Checkout keeps only the payment token from the provider.')}${row('Applies to', 'payment, checkout, card')}${row('Do not', 'store card number, cache card details, store CVV')}${row('Instead', 'Use hosted tokenization and keep only the payment token.')}${row('Decided on', '2026-09-02')}</tbody></table><p>Style 1: a page with the label "decision" and a summary table.</p>`,
  },
  {
    title: 'Decision: product analytics stay first-party', label: null,
    body: `<ac:structured-macro ac:name="details"><ac:rich-text-body><table><tbody><tr><th><p><strong>Status</strong></p></th><td><p><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Complete</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></p></td></tr><tr><th><p><strong>Impact</strong></p></th><td><p>High</p></td></tr></tbody></table></ac:rich-text-body></ac:structured-macro><h2>Background</h2><p>Users were promised that behavioural data stays with us.</p><h2>Outcome</h2><p>No third-party analytics or session replay SDKs ship in the app. Events go to our internal event collector.</p><p>Style 2: Confluence's Decision documentation layout (Page Properties with Status, and an Outcome section). No label.</p>`,
  },
  {
    title: 'Mobile weekly sync (sample)', label: null,
    body: '<p>Style 3: an ordinary meeting notes page with an inline decision, typed with /decision. No label, found because this space is listed in Decision Drift Guard settings.</p><ac:adf-extension><ac:adf-node type="decision-list"><ac:adf-attribute key="local-id">ddg-dl-1</ac:adf-attribute><ac:adf-node type="decision-item"><ac:adf-attribute key="local-id">ddg-di-1</ac:adf-attribute><ac:adf-attribute key="state">DECIDED</ac:adf-attribute><ac:adf-content>We do not add SMS one-time codes to sign-in. Use magic links or passkeys.</ac:adf-content></ac:adf-node><ac:adf-node type="decision-item"><ac:adf-attribute key="local-id">ddg-di-2</ac:adf-attribute><ac:adf-attribute key="state">DECIDED</ac:adf-attribute><ac:adf-content>New releases support iOS 16 or later and Android 10 or later.</ac:adf-content></ac:adf-node></ac:adf-node><ac:adf-fallback><ul class="decision-list"><li>We do not add SMS one-time codes to sign-in. Use magic links or passkeys.</li><li>New releases support iOS 16 or later and Android 10 or later.</li></ul></ac:adf-fallback></ac:adf-extension>',
  },
];

// none of these repeat the decision's words; each shows one detection path
const ISSUES = [
  ['Remember the card in the phone keychain for one-tap checkout', 'Returning buyers should not retype their card.'],
  ['Add Mixpanel to track the signup funnel', 'Growth wants drop-off charts this sprint.'],
  ['Let users sign in with a 6-digit code sent by text', 'For users whose email is slow.'],
  ['Keep the app working on iOS 15 for an enterprise customer', 'They have 300 devices that cannot upgrade.'],
  ['Show a spinner on the pay button while payment is in flight', 'Small loading state fix.'],
];

const call = async (fn, path, init) => {
  const res = await fn(path, init);
  const tx = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${tx.slice(0, 160)}`);
  return tx ? JSON.parse(tx) : {};
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });

export const createSampleData = async ({ spaceKey, projectKey }) => {
  const sk = String(spaceKey || '').replace(/[^A-Za-z0-9~_-]/g, '');
  const pk = String(projectKey || '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
  if (!sk || !pk) throw new Error('Give a Confluence space key and a Jira project key.');
  const flagKey = `seeded:${sk}:${pk}`;
  const already = await getFlag(flagKey);
  if (already && already.issues && already.issues.length) return { ...already, again: true };
  if (already) return already;
  const C = (p, i) => call(api.asUser().requestConfluence.bind(api.asUser()), p, i);
  const J = (p, i) => call(api.asUser().requestJira.bind(api.asUser()), p, i);
  const spaces = await C(route`/wiki/api/v2/spaces?keys=${sk}`);
  const space = spaces.results && spaces.results[0];
  if (!space) throw new Error(`Confluence space ${sk} not found or not visible to you.`);
  const parent = await C(route`/wiki/api/v2/pages`, json('POST', { spaceId: space.id, status: 'current', title: `Decision Drift Guard sample decisions ${new Date().toISOString().slice(0, 10)}`, body: { representation: 'storage', value: '<p>Sample data created by Decision Drift Guard. Safe to delete.</p>' } }));
  const pages = [];
  for (const pg of PAGES) {
    const p = await C(route`/wiki/api/v2/pages`, json('POST', { spaceId: space.id, parentId: parent.id, status: 'current', title: pg.title, body: { representation: 'storage', value: pg.body } }));
    if (pg.label) await C(route`/wiki/rest/api/content/${p.id}/label`, json('POST', [{ prefix: 'global', name: pg.label }]));
    pages.push({ id: p.id, title: pg.title });
  }
  // make sure style 3 is found: add the space to the decision spaces
  const st = await getSettings();
  if (!st.spaces.includes(sk)) await saveSettings({ ...st, spaces: [...st.spaces, sk] });
  const out = { space: sk, project: pk, parentId: parent.id, pages, issues: [], createdAt: new Date().toISOString() };
  await setFlag(flagKey, out);
  return out;
};

// Confluence search needs a few seconds to index new pages; the panel waits for it before creating work items.
export const sampleIndexed = async ({ pageIds }) => {
  const ids = (pageIds || []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean);
  if (!ids.length) return { ready: false, found: 0 };
  const cql = `id in (${ids.join(',')})`;
  const r = await call(api.asUser().requestConfluence.bind(api.asUser()), route`/wiki/rest/api/content/search?cql=${cql}&limit=10`);
  const found = (r.results || []).length;
  return { ready: found >= ids.length, found };
};

export const createSampleIssues = async ({ spaceKey, projectKey }) => {
  const sk = String(spaceKey || '').replace(/[^A-Za-z0-9~_-]/g, '');
  const pk = String(projectKey || '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
  const flagKey = `seeded:${sk}:${pk}`;
  const out = await getFlag(flagKey);
  if (!out) throw new Error('Create the sample decision pages first.');
  if (out.issues && out.issues.length) return out;
  const J = (p, i) => call(api.asUser().requestJira.bind(api.asUser()), p, i);
  const types = await J(route`/rest/api/3/issue/createmeta/${pk}/issuetypes`);
  const list = types.issueTypes || types.values || [];
  const type = list.find((t) => !t.subtask && /task/i.test(t.name)) || list.find((t) => !t.subtask);
  if (!type) throw new Error(`No issue type found in project ${pk}.`);
  const issues = [];
  for (const [summary, d] of ISSUES) {
    const r = await J(route`/rest/api/3/issue`, json('POST', { fields: { project: { key: pk }, issuetype: { id: type.id }, summary, description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: d }] }] } } }));
    issues.push(r.key);
  }
  const done = { ...out, issues };
  await setFlag(flagKey, done);
  return done;
};
