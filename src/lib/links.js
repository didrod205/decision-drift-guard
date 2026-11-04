import { issueLinkTargets, fetchDecisionPage, searchIssues, remoteLinksOf, siteHost } from './atlassian';
import { linkedPageIds } from './change';
import { addLink, getSettings } from './store';

// Links in a work item's description, and Confluence links on it, that point to a recorded
// decision page become "follows this decision" links. Pages that are not decisions are skipped.
export const autoLink = async (key) => {
  const targets = await issueLinkTargets(key, 'app');
  console.log(`DDG ${key} link targets ${targets.map((x) => x.pageId).join(',') || 'none'}`);
  if (!targets.length) return [];
  const settings = await getSettings();
  const made = [];
  for (const { pageId, via } of targets.slice(0, 10)) {
    const page = await fetchDecisionPage(pageId, 'app', settings);
    if (!page || !page.decisions.length) { console.log(`DDG ${key} page ${pageId} skipped: ${page ? 'not a decision' : 'not readable'}`); continue; }
    made.push(await addLink({ pageId: page.id, issueKey: key, via, title: page.title, url: page.url }));
  }
  return made;
};


// One-time scan of existing work: every work item in a project (newest first, 50 per call) whose
// description or Confluence links point to a recorded decision page gets a "follows" link.
export const scanProject = async ({ projectKey, nextPageToken }) => {
  const key = String(projectKey || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!key) throw new Error('Enter a Jira project key');
  const jql = `project = "${key}" ORDER BY created DESC`;
  const [res, host, settings] = await Promise.all([searchIssues(jql, nextPageToken), siteHost(), getSettings()]);
  const issues = res.issues || [];
  const pages = new Map();
  const out = { jql, scanned: issues.length, withPageLinks: 0, following: 0, newLinks: 0, items: [] };
  for (let i = 0; i < issues.length; i += 10) {
    await Promise.all(issues.slice(i, i + 10).map(async (it) => {
      const remote = await remoteLinksOf(it.key).catch(() => []);
      const targets = linkedPageIds({ description: it.fields && it.fields.description, remoteLinks: remote }, host);
      if (!targets.length) return;
      out.withPageLinks++;
      let follows = false;
      for (const { pageId, via } of targets.slice(0, 10)) {
        if (!pages.has(pageId)) pages.set(pageId, fetchDecisionPage(pageId, 'user', settings).catch(() => null));
        const page = await pages.get(pageId);
        if (!page || !page.decisions.length) continue;
        const l = await addLink({ pageId: page.id, issueKey: it.key, via: `${via} (scan)`, title: page.title, url: page.url });
        follows = true;
        if (!l.existed) { out.newLinks++; out.items.push(`${it.key} follows ${page.title}`); }
      }
      if (follows) out.following++;
    }));
  }
  out.nextPageToken = res.nextPageToken || null;
  out.items = out.items.slice(0, 20);
  return out;
};
