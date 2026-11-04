import { checkIssue } from './lib/core';
import { fetchDecisions, getIssue, commentConflicts, addIssueLabel } from './lib/atlassian';

// On every new work item: rule check only. Comment only when a rule is broken word for word (evidence required).
export const onIssueCreated = async (event) => {
  const key = event && event.issue && event.issue.key;
  if (!key) return;
  try {
    const [issue, decisions] = await Promise.all([getIssue(key, 'app'), fetchDecisions('app')]);
    const result = checkIssue(issue, decisions);
    console.log(`DDG ${key} state=${result.state} conflicts=${result.conflicts.length} related=${result.related.length}`);
    if (result.state === 'conflict') {
      await commentConflicts(key, result);
      await addIssueLabel(key, 'decision-drift');
    }
  } catch (e) {
    console.error(`DDG ${key} failed: ${e.message}`);
  }
};
