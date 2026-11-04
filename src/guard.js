import { fetchDecisionPage } from './lib/atlassian';
import { linksForIssue, getAck } from './lib/store';
import { statusOf, replacementOf, RETIRED, closeMessage } from './lib/change';

// Followed decisions that are now Superseded, Deprecated, Rejected or Abandoned and not yet marked as checked.
export const retiredFollowed = async (issueKey, as = 'app') => {
  const links = await linksForIssue(issueKey);
  const out = [];
  for (const l of links.slice(0, 10)) {
    const page = await fetchDecisionPage(l.pageId, as).catch(() => null);
    if (!page) continue;
    const status = statusOf(page.body);
    if (!RETIRED.test(status)) continue;
    const ack = await getAck(issueKey, l.pageId);
    out.push({ pageId: l.pageId, title: page.title, url: page.url, status, replacement: replacementOf(page.body), checked: !!ack });
  }
  return out;
};

// Jira workflow validator: add "Followed decisions are still current" to a transition (for example to Done).
// It fails only when a followed decision is retired and nobody has marked the work as checked.
export const validateClose = async (args) => {
  const key = args && args.issue && args.issue.key;
  if (!key) return { result: true };
  try {
    const open = (await retiredFollowed(key, 'app')).filter((x) => !x.checked);
    if (!open.length) return { result: true };
    return { result: false, errorMessage: closeMessage(open) };
  } catch (e) {
    console.error(`DDG close check ${key} failed: ${e.message}`);
    return { result: true };
  }
};
