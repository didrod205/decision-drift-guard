import { runCheck } from './resolvers';
import { commentConflicts, addIssueLabel, pageVersion, commentDecisionChange } from './lib/atlassian';
import { recordResult, recordEvent, linksForPage, claimChange, saveChange } from './lib/store';
import { autoLink } from './lib/links';
import { compareVersions } from './lib/change';

// On every new work item: code-only check (no LLM). Comments only with evidence:
// "conflict" when a rule is broken word for word, "possible conflict" when the same thing is described in other words.
export const onIssueCreated = async (event) => {
  const key = event && event.issue && event.issue.key;
  if (!key) return;
  try {
    const links = await autoLink(key);
    if (links.length) console.log(`DDG ${key} linked to ${links.map((l) => l.pageId).join(',')}`);
  } catch (e) {
    console.error(`DDG ${key} link failed: ${e.message}`);
  }
  try {
    const result = await runCheck(key, 'app');
    console.log(`DDG ${key} state=${result.state} conflicts=${result.conflicts.length} possible=${(result.possible || []).length} related=${result.related.length}`);
    if (result.state === 'conflict' || result.state === 'possible-conflict') {
      await commentConflicts(key, result);
      await addIssueLabel(key, result.state === 'conflict' ? 'decision-drift' : 'decision-drift-possible');
      await recordResult(result, 'on create');
    }
  } catch (e) {
    console.error(`DDG ${key} failed: ${e.message}`);
  }
};

// Description edited or a Confluence link added later: pick up new decision links.
export const onIssueUpdated = async (event) => {
  const key = event && event.issue && event.issue.key;
  if (!key) return;
  try {
    const links = await autoLink(key);
    if (links.length) console.log(`DDG ${key} links ${links.map((l) => l.pageId).join(',')}`);
  } catch (e) {
    console.error(`DDG ${key} link failed: ${e.message}`);
  }
};

// A decision page was edited: compare the new version with the one before it, in code.
// Retired (Superseded, Deprecated, Rejected ...) or decision text changed: every linked work item
// gets one comment and the label decision-changed. Anything else is recorded as ignored.
export const handlePageChange = async (pageId) => {
  const links = await linksForPage(pageId);
  if (!links.length) return { pageId, kind: 'not-followed', affected: [] };
  const cur = await pageVersion(pageId);
  if (cur.version < 2) return { pageId, kind: 'first-version', affected: [] };
  if (!(await claimChange(pageId, cur.version))) return { pageId, kind: 'already-handled', affected: [] };
  const prev = await pageVersion(pageId, cur.version - 1);
  const cmp = compareVersions(prev.body, cur.body);
  const ch = { ...cmp, title: cur.title, url: links[0].url || cur.url, version: cur.version };
  const affected = [];
  const failed = [];
  if (cmp.kind !== 'ignored') {
    for (const link of links) {
      try {
        await commentDecisionChange(link.issueKey, ch, link);
        await addIssueLabel(link.issueKey, 'decision-changed');
        await recordEvent({ decisionId: String(pageId), decisionTitle: cur.title, decisionUrl: ch.url, issueKey: link.issueKey, kind: 'decision-changed', source: `page v${cur.version}`, rule: cmp.reason, quote: (cmp.removed[0] || cmp.added[0] || cmp.reason).slice(0, 300) });
        affected.push(link.issueKey);
      } catch (e) {
        failed.push(link.issueKey);
        console.error(`DDG change ${pageId} -> ${link.issueKey} failed: ${e.message}`);
      }
    }
  }
  await saveChange(pageId, cur.version, { ...ch, state: 'done', linked: links.map((l) => l.issueKey), affected, failed });
  console.log(`DDG page ${pageId} v${cur.version} ${cmp.kind}: ${affected.length}/${links.length} commented`);
  return { pageId, kind: cmp.kind, affected, failed };
};

export const onPageUpdated = async (event) => {
  const id = event && event.content && event.content.id;
  if (!id) return;
  try {
    await handlePageChange(String(id));
  } catch (e) {
    console.error(`DDG page ${id} failed: ${e.message}`);
  }
};
