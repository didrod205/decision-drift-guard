import Resolver from '@forge/resolver';
import { checkIssue, noConfluence } from '../lib/core';
import { fetchDecisions, getIssue, requestReopen, siteBase } from '../lib/atlassian';

const resolver = new Resolver();

resolver.define('check', async ({ context }) => {
  const key = context.extension.issue.key;
  const issue = await getIssue(key);
  let decisions;
  try {
    decisions = await fetchDecisions();
  } catch (e) {
    return noConfluence(key, e);
  }
  return checkIssue(issue, decisions);
});

resolver.define('reopen', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const base = await siteBase();
  return requestReopen({ pageId: payload.pageId, issueKey: key, issueUrl: `${base}/browse/${key}`, reason: payload.reason });
});

export const handler = resolver.getDefinitions();
