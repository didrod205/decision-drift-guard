# Decision Drift Guard

**Teams record decisions in Confluence, then open Jira work that quietly contradicts them.** Decision Drift Guard checks every Jira work item against the decisions your team already made and shows the evidence: the decision page, the rule, and the words in the work item that break it.

## Principles
1. **No warning without evidence.** Every flag links the decision and quotes the rule and the work item text; possible conflicts also show which words were read as the same meaning.
2. **"Conflict", "possible conflict" and "needs judgment" are different states.** The automatic check is plain code; a Rovo agent gives a verdict with quotes or answers "Cannot tell".
3. **Decisions are never edited by the app.** Disagreeing with a decision creates a reopen request (a comment on the decision page), not a silent change.

## How it works
- **Where decisions come from (no label habit needed):** pages with your decision labels (default `decision`), pages made from Confluence's Decision documentation template (Page Properties with Status, plus an Outcome section), inline decisions typed with `/decision` on pages in the decision spaces you list, and pages whose title contains your title words (default: decision, ADR). Superseded, Rejected, Draft, In progress and Not started decisions are ignored.
- **On create (`avi:jira:created:issue` trigger), code only:** word-for-word `Do not` breaks become a **Conflict** comment (label `decision-drift`); the same thing in other words becomes a **Possible conflict** comment (label `decision-drift-possible`) listing the words read as the same meaning. Negations ("remove the SDK") and the decision's own agreed alternative are not flagged.
- **Jira panel (`jira:issueContext`):** the same result as cards, plus a button that opens the Rovo agent.
- **Settings (`jira:adminPage`):** decision sources, team words for the matcher, a preview of found decisions, and **Create sample data** (3 decision pages in three recording styles + 5 paraphrased work items).
- **Decision drift history (`jira:globalPage`):** per decision, every work item that drifted from it and every reopen request, with evidence and dates (Forge storage).
- **Rovo agent "Decision Drift Guard"** with actions `get-decision-context`, `list-decisions`, `request-decision-reopen`.

## Setup
1. Install the app (Jira, then connect Confluence when asked).
2. Jira settings > Apps > **Decision Drift Guard settings**: click **Create sample data**, or tell the app where your decisions live.
3. Create or open a Jira work item and expand **Decision Drift Guard** in the details panel.

## Measured (development numbers)
`node eval/run.mjs` runs the matcher on two sets of test work items against the 7 sample decisions. Set 1 (written before the matcher, then used for tuning): 24 of 24 paraphrases caught, 0 of 16 false flags. Set 2 (written after tuning, not tuned on): 13 of 16 caught, 2 of 16 false flags; 14 of 16 and 2 of 16 when decisions are free sentences only. The word-for-word check alone caught 0 of the paraphrases in either set. Both sets were written by the same AI that wrote the matcher.


## Field test on third-party data (run once, not tuned)
`eval/real/` measures the matcher on the open source Backstage project: its 14 ADRs (ADR002 to ADR015, Apache-2.0, copied unchanged in `eval/real/adr/` with a NOTICE) against real GitHub issues and pull requests. Ground truth comes from the maintainers themselves: 64 items where a comment links a specific ADR because the work went against it (each keeps the comment URL), plus 56 unrelated closed items. Reading title and description only, the app commented with the right ADR on 0 of 64 and showed it as a "Needs judgment" card on 10 of 64; it commented on 1 of 56 unrelated items. In 54 of the 64 the conflict was pointed out only in inline code review, so it lived in the diff, and most ADRs state "use X" rather than "never Y". The app today catches drift stated in the work item against a decision with an explicit prohibition. Full method and numbers: `eval/real/README.md`.

## Data
No egress, no external AI. Settings and the audit trail (work item keys, decision titles and links, quoted evidence) are kept in Forge storage on Atlassian. See [PRIVACY.md](PRIVACY.md).

## Built with
Forge (UI Kit, `jira:issueContext`, `jira:adminPage`, `jira:globalPage`, `trigger`, `rovo:agent`, `action`, key-value storage), Jira REST API v3, Confluence REST API (CQL search, storage format, v2 pages and footer comments), Atlassian Rovo.

## How this was made
Planning, code, tests and text were written by Claude (Anthropic), an AI model, working in an AI agent setup run by Kyoungchan Yang (E:LAB STUDIO). The agent also ran the deployments and tests on his Atlassian developer account. Kyoungchan Yang decided to enter, approved the accounts and the public demo video, set the limits (no paid usage, AI use disclosed), and submits the project.

## License
MIT
