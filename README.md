# Decision Drift Guard

**Teams record decisions in Confluence, then open Jira work that quietly contradicts them.** Decision Drift Guard checks every Jira work item against the decisions your team already made and shows the evidence: the decision page, the rule, and the words in the work item that break it.

## Principles
1. **No warning without evidence.** Every flag links the decision and quotes the rule and the work item text; possible conflicts also show which words were read as the same meaning.
2. **"Conflict", "possible conflict" and "needs judgment" are different states.** The automatic check is plain code; a Rovo agent gives a verdict with quotes or answers "Cannot tell".
3. **Decisions are never edited by the app.** Disagreeing with a decision creates a reopen request (a comment on the decision page), not a silent change.

## Main feature: decision changed
When a Confluence decision page that a work item follows gets a new version, the app compares it with the previous version (code only, `src/lib/change.js`):
- **Retired:** status became Superseded, Deprecated, Rejected, Abandoned, Withdrawn, Archived or Replaced.
- **Text changed:** a sentence of the Decision/Outcome text was added or removed (case, spacing and punctuation ignored).
- **Ignored edit:** anything else, nobody notified.
Retired and Text changed put one comment (statuses, removed and added sentences, replacing decision) and the label `decision-changed` on every following work item. A work item follows a decision through a link in its description, a remote link to the page, or Follow in the panel. Tests: `eval/change/README.md` (21 unit cases; replay of 723 real ADR version pairs from Backstage and Cosmos SDK).

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


## Field tests on third-party data
Two open source projects, both Apache-2.0, with ADRs copied unchanged and a NOTICE.

- **Backstage (`eval/real/`, now the tuning set).** 14 ADRs against real GitHub issues and pull requests. Ground truth comes from the maintainers: 64 items where a comment links a specific ADR because the work went against it (each keeps the comment URL), plus 56 unrelated closed items. The first run (v3, untuned) commented with the right ADR on 0 of 64, showed it as a card on 10 of 64, commented on 1 of 56 unrelated items and showed a card on 19 of 56. v4 was then built on this set ("use X" decisions become rules about competing tools, decisions without a "Decision" heading are read, stricter cards): 2 of 64 commented, 4 of 64 shown at all, 1 of 56 unrelated commented, 7 of 56 unrelated with a card. These are development numbers.
- **Cosmos SDK (`eval/real2/`, not used for tuning, run once).** 62 ADR files, 222 items whose comments link an ADR, labels frozen before the run: 6 positives, 56 unrelated. v4 commented on 0 of 6 and showed the right ADR on 0 of 6; 0 of 56 unrelated commented, 5 of 56 with a card. Cosmos ADRs are protocol and module designs, not tool choices or prohibitions, so the rules do not apply.
- **Out of scope:** in 54 of the 64 Backstage items the conflict was raised only in inline code review, so it lived in the diff. The app reads the work item text and the titles of linked pull requests, not code. Method and numbers: `eval/real/README.md`, `eval/real2/README.md`.

## Data
No egress, no external AI. Settings and the audit trail (work item keys, decision titles and links, quoted evidence) are kept in Forge storage on Atlassian. See [PRIVACY.md](PRIVACY.md).

## Built with
Forge (UI Kit, `jira:issueContext`, `jira:adminPage`, `jira:globalPage`, `trigger`, `rovo:agent`, `action`, key-value storage), Jira REST API v3, Confluence REST API (CQL search, storage format, v2 pages and footer comments), Atlassian Rovo.

## How this was made
Planning, code, tests and text were written by Claude (Anthropic), an AI model, working in an AI agent setup run by Kyoungchan Yang (E:LAB STUDIO). The agent also ran the deployments and tests on his Atlassian developer account. Kyoungchan Yang decided to enter, approved the accounts and the public demo video, set the limits (no paid usage, AI use disclosed), and submits the project.

## License
MIT
