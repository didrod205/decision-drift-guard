import { checkIssue, noConfluence } from './lib/core';
import { fetchDecisions, getIssue, requestReopen, siteBase } from './lib/atlassian';

const keyFrom = (payload) => {
  const k = (payload && (payload.issueKey || (payload.context && payload.context.jira && payload.context.jira.issueKey))) || '';
  return String(k).trim().toUpperCase();
};

// Rovo action: issue text + rule-based result + full text of every active decision that might apply.
export const getDecisionContext = async (payload) => {
  const key = keyFrom(payload);
  if (!key) return { error: 'Give me a Jira work item key, for example MOBL-12.' };
  const issue = await getIssue(key);
  let decisions;
  try { decisions = await fetchDecisions(); } catch (e) { return { issue, ruleCheck: noConfluence(key, e), activeDecisions: [] }; }
  const result = checkIssue(issue, decisions);
  const activeDecisions = decisions.filter((d) => d.active).map((d) => ({
    key: d.key, pageId: d.pageId, title: d.title, url: d.url, status: d.status, outcome: d.outcome,
    appliesTo: d.applies, doNot: d.donot, instead: d.instead, decidedOn: d.decidedOn,
  }));
  return { issue, ruleCheck: result, activeDecisions, inactiveDecisionsIgnored: decisions.filter((d) => !d.active).map((d) => ({ key: d.key, title: d.title, status: d.status, supersededBy: d.supersededBy })) };
};

export const listDecisions = async (payload) => {
  const q = String((payload && payload.query) || '').toLowerCase();
  const decisions = await fetchDecisions();
  const out = decisions.filter((d) => !q || `${d.title} ${d.outcome} ${d.applies.join(' ')}`.toLowerCase().includes(q));
  return { count: out.length, decisions: out.map((d) => ({ key: d.key, pageId: d.pageId, title: d.title, url: d.url, status: d.status, outcome: d.outcome })) };
};

export const reopenDecision = async (payload) => {
  const key = keyFrom(payload);
  if (!key || !payload.pageId) return { error: 'Need both the work item key and the decision page id.' };
  const base = await siteBase();
  const r = await requestReopen({ pageId: payload.pageId, issueKey: key, issueUrl: `${base}/browse/${key}`, reason: payload.reason });
  return { ok: true, message: `Reopen request posted as a comment on the decision page. The decision itself was not changed.`, ...r };
};
