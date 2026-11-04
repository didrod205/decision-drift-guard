# Decision Drift Guard

**Teams record decisions in Confluence, then open Jira work that quietly contradicts them.** Decision Drift Guard checks every Jira work item against the decisions your team already made and shows the evidence: the decision page, the rule, and the words in the work item that break it.

## Principles
1. **No warning without evidence.** Every warning links the decision page and quotes the rule and the work item text.
2. **"Conflicts" and "needs judgment" are different states.** Word-for-word rule breaks are flagged by deterministic rules; topic overlaps are handed to a Rovo agent that must quote its evidence or answer "Cannot tell".
3. **Decisions are never edited by the app.** Disagreeing with a decision creates a reopen request (a comment on the decision page), not a silent change.

## How it works
- **Decision pages:** any Confluence page with the label `decision` and a summary table with rows `Status`, `Outcome`, `Applies to`, `Do not`, `Instead` (optional: `Decided on`, `Owner`, `Superseded by`). Pages whose status is Superseded, Rejected, Draft or Not started are ignored.
- **Jira panel (`jira:issueContext`):** five states: Conflicts with a decision, Needs judgment, No decision covers this, No decisions found, Not enough detail.
- **On create (`avi:jira:created:issue` trigger):** if a new work item breaks a `Do not` rule, the app comments with the evidence and adds the label `decision-drift`.
- **Rovo agent "Decision Drift Guard"** with actions `get-decision-context`, `list-decisions`, `request-decision-reopen`. It catches paraphrased conflicts (for example "a 6-digit code sent by text" vs. "no SMS codes").

## Setup
1. Install the app (Jira, then connect Confluence when asked).
2. Label your decision pages `decision` and add the summary table rows above.
3. Open any Jira work item and expand **Decision Drift Guard** in the details panel.

## Data
No storage, no egress, no external AI. See [PRIVACY.md](PRIVACY.md).

## Built with
Forge (UI Kit, `jira:issueContext`, `trigger`, `rovo:agent`, `action`), Jira REST API v3, Confluence REST API (CQL search, v2 footer comments), Atlassian Rovo.

## How this was made
Planning, code and text were written by Claude (Anthropic), an AI model, working in an AI agent setup run by Kyoungchan Yang (E:LAB STUDIO), who reviewed and submitted it.

## License
MIT
