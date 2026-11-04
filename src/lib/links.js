import { issueLinkTargets, fetchDecisionPage } from './atlassian';
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

