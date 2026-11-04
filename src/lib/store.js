import { kvs, WhereConditions } from '@forge/kvs';

export const DEFAULT_SETTINGS = { labels: ['decision'], titleWords: ['decision', 'ADR'], spaces: [], useTemplate: true, useInline: true, synonyms: '' };

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);

export const cleanSettings = (s) => ({
  labels: list(s.labels).map((x) => x.toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean),
  titleWords: list(s.titleWords).map((x) => x.replace(/[^A-Za-z0-9 -]/g, '')).filter(Boolean),
  spaces: list(s.spaces).map((x) => x.replace(/[^A-Za-z0-9~_-]/g, '')).filter(Boolean),
  useTemplate: s.useTemplate !== false,
  useInline: s.useInline !== false,
  synonyms: String(s.synonyms || '').slice(0, 4000),
});

export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await kvs.get('settings')) || {}) });
export const saveSettings = async (s) => { const c = cleanSettings({ ...DEFAULT_SETTINGS, ...s }); await kvs.set('settings', c); return c; };

// Audit trail: one record per decision, work item and outcome. First and last time seen are kept.
const safe = (x) => String(x || '').replace(/[^A-Za-z0-9:._-]/g, '_').slice(0, 120);
export const recordEvent = async (ev) => {
  const key = `h:${safe(ev.decisionId)}:${safe(ev.issueKey)}:${safe(ev.kind)}`;
  const now = new Date().toISOString();
  const prev = await kvs.get(key);
  const value = { ...(prev || { firstSeen: now, count: 0 }), ...ev, lastSeen: now, count: ((prev && prev.count) || 0) + 1 };
  await kvs.set(key, value);
  return value;
};

export const recordResult = async (result, source) => {
  const groups = [['conflict', result.conflicts || []], ['possible-conflict', result.possible || []]];
  const jobs = [];
  for (const [kind, cards] of groups) {
    for (const c of cards) {
      jobs.push(recordEvent({
        decisionId: c.itemId ? `${c.pageId}.${c.itemId}` : c.pageId, decisionTitle: c.title, decisionKey: c.key, decisionUrl: c.url,
        issueKey: result.issueKey, kind, source, rule: c.evidence ? c.evidence.rule : '', quote: c.evidence ? c.evidence.issueQuote : '',
      }));
    }
  }
  await Promise.all(jobs);
};

export const readHistory = async () => {
  const out = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    let qb = kvs.query().where('key', WhereConditions.beginsWith('h:')).limit(100);
    if (cursor) qb = qb.cursor(cursor);
    const r = await qb.getMany();
    out.push(...r.results.map((x) => x.value));
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  return out;
};

export const getFlag = (k) => kvs.get(k);
export const setFlag = (k, v) => kvs.set(k, v);
