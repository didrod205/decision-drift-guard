import { runCheck } from './resolvers';
import { commentConflicts, addIssueLabel } from './lib/atlassian';
import { recordResult } from './lib/store';

// On every new work item: code-only check (no LLM). Comments only with evidence:
// "conflict" when a rule is broken word for word, "possible conflict" when the same thing is described in other words.
export const onIssueCreated = async (event) => {
  const key = event && event.issue && event.issue.key;
  if (!key) return;
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
