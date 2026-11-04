import Resolver from '@forge/resolver';
import { checkIssue, noConfluence } from '../lib/core';
import { fetchDecisions, getIssue, requestReopen, siteBase } from '../lib/atlassian';
import { getSettings, saveSettings, recordResult, recordEvent, readHistory } from '../lib/store';
import { createSampleData, sampleIndexed, createSampleIssues } from '../lib/seed';

const resolver = new Resolver();

export const runCheck = async (key, as) => {
  const settings = await getSettings();
  const issue = await getIssue(key, as);
  let decisions;
  try {
    decisions = await fetchDecisions(as, settings);
  } catch (e) {
    return noConfluence(key, e);
  }
  return checkIssue(issue, decisions, { synonyms: settings.synonyms });
};

resolver.define('check', async ({ context }) => {
  const key = context.extension.issue.key;
  const result = await runCheck(key, 'user');
  await recordResult(result, 'panel').catch(() => {});
  return result;
});

resolver.define('reopen', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const base = await siteBase();
  const r = await requestReopen({ pageId: payload.pageId, issueKey: key, issueUrl: `${base}/browse/${key}`, reason: payload.reason });
  await recordEvent({ decisionId: payload.itemId ? `${payload.pageId}.${payload.itemId}` : payload.pageId, decisionTitle: payload.title || '', decisionUrl: payload.url || '', issueKey: key, kind: 'reopen-requested', source: 'panel', quote: String(payload.reason || '').slice(0, 300) }).catch(() => {});
  return r;
});

resolver.define('getSettings', async () => getSettings());
resolver.define('saveSettings', async ({ payload }) => saveSettings(payload || {}));
resolver.define('seed', async ({ payload }) => createSampleData(payload || {}));
resolver.define('seedIndexed', async ({ payload }) => sampleIndexed(payload || {}));
resolver.define('seedIssues', async ({ payload }) => createSampleIssues(payload || {}));
resolver.define('preview', async () => {
  const settings = await getSettings();
  const d = await fetchDecisions('user', settings);
  return { count: d.length, active: d.filter((x) => x.active).length, bySource: d.reduce((a, x) => ({ ...a, [x.source]: (a[x.source] || 0) + 1 }), {}), sample: d.slice(0, 8).map((x) => ({ title: x.title, source: x.source, status: x.status, url: x.url })) };
});
resolver.define('history', async () => {
  const rows = await readHistory();
  return { rows: rows.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))), base: await siteBase() };
});

export const handler = resolver.getDefinitions();
