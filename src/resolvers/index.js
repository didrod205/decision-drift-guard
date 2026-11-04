import Resolver from '@forge/resolver';
import { checkIssue, noConfluence } from '../lib/core';
import { fetchDecisions, getIssue, requestReopen, siteBase, fetchDecisionPage } from '../lib/atlassian';
import { statusOf, replacementOf, RETIRED } from '../lib/change';
import { getSettings, saveSettings, recordResult, recordEvent, readHistory, addLink, removeLink, linksForIssue, allLinks, readChanges } from '../lib/store';
import { autoLink } from '../lib/links';
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

// "This work item follows this decision": links made by hand in the panel, or found in the description.
resolver.define('links', async ({ context }) => {
  const key = context.extension.issue.key;
  await autoLink(key).catch(() => []);
  const [raw, decisions] = await Promise.all([linksForIssue(key), fetchDecisions('user').catch(() => [])]);
  // Current status of each followed decision, read from the page now (code only).
  const links = await Promise.all(raw.slice(0, 10).map(async (l) => {
    const page = await fetchDecisionPage(l.pageId, 'user').catch(() => null);
    if (!page) return { ...l, status: 'not readable' };
    const status = statusOf(page.body) || 'No status field';
    return { ...l, title: page.title, url: page.url || l.url, status, retired: RETIRED.test(status), replacement: RETIRED.test(status) ? replacementOf(page.body) : null };
  }));
  const seen = new Set();
  const pages = decisions.filter((d) => d.active && !seen.has(d.pageId) && seen.add(d.pageId)).map((d) => ({ pageId: d.pageId, title: d.title, url: d.url }));
  return { links, pages };
});
resolver.define('link', async ({ payload, context }) => addLink({ pageId: String(payload.pageId), issueKey: context.extension.issue.key, via: 'panel', title: payload.title, url: payload.url }));
resolver.define('unlink', async ({ payload, context }) => { await removeLink({ pageId: String(payload.pageId), issueKey: context.extension.issue.key }); return true; });
resolver.define('changes', async () => {
  const [changes, links] = await Promise.all([readChanges(), allLinks()]);
  return { changes: changes.sort((a, b) => String(b.at).localeCompare(String(a.at))), links, base: await siteBase() };
});

export const handler = resolver.getDefinitions();
