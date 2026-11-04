# Decision Drift Guard

**Teams record decisions in Confluence (ADRs, Atlassian's DACI decision template https://www.atlassian.com/software/confluence/templates/decision , inline decisions), then supersede or rewrite them. The Jira work planned on the old decision is not told.** Decision Drift Guard tells every work item that follows a decision exactly what changed, and can stop it from being closed until someone checks.

## Principles
1. **Exact rules for the main feature.** Plain code, the same two page versions always give the same answer, and the rule that fired is shown.
2. **No warning without evidence.** Every comment links the decision and quotes what changed.
3. **Decisions are never edited by the app.** Disagreeing with a decision creates a reopen request (a comment on the decision page), not a silent change.

## Main feature: decision changed
When a Confluence decision page that a work item follows gets a new version, the app compares it with the previous version (code only, `src/lib/change.js`):
- **Retired:** status became Superseded, Deprecated, Rejected, Abandoned, Withdrawn, Archived or Replaced.
- **Text changed:** a sentence of the decision text (Decision or Outcome section or row; on inline-decision pages, the decided items) was added or removed.
- **Ignored edit:** anything else, nobody notified. This includes proofreading: case, spacing, punctuation, re-wrapped lists, link addresses, a doubled word, a small grammar word, and misspellings of at most 2 letters in words of 4+ letters (never digits, modal, negation or choice words such as must, not, never, use, enable, disable).
Retired and Text changed put one comment (statuses, removed sentences in red and added in green, replacing decision) and the label `decision-changed` on every following work item. Tests: `eval/change/README.md` (36 unit cases; replay of 723 real ADR version pairs from Backstage and Cosmos SDK).

## Safety nets
- **Following a decision:** a link in the description, a Confluence (remote) link, or Follow in the panel; new and edited work items are linked automatically.
- **Scan existing work** (settings page): JQL `project = "KEY" ORDER BY created DESC`, up to 1,000 work items per run (a second run continues), same link rules, no comments.
- **Close check** (`jira:workflowValidator` "Followed decisions are still current"): add it to a transition such as Done; it stops the transition while a followed decision is retired and nobody clicked **Checked against the current decision** in the panel.
- **Decision drift history** (`jira:globalPage`): counts and every version with the rule that fired, colored diffs and the work items commented.

## Other checks
- **Explicit bans (on by default):** a new work item that names, word for word, something a decision bans (Do not row, must not, never, avoid) gets a comment quoting both. Fired 0 times on the two real ADR sets.
- **Experimental (off by default):** meaning-based matching (paraphrases, competing tools) and related-decision cards. Real data: 2 of 64 on the tuning set, 0 of 6 on an untuned set (below).
- **Where decisions come from:** decision labels (default `decision`), pages made from Confluence's Decision documentation template (Page Properties with Status, plus an Outcome section), inline decisions on pages in the decision spaces you list, and title words (default: decision, ADR).
- **Rovo agent "Decision Drift Guard"** with actions `get-decision-context`, `list-decisions`, `request-decision-reopen`.

## Setup
1. Install the app (Jira, then connect Confluence when asked).
2. Jira settings > Apps > **Decision Drift Guard settings**: click **Create sample data**, or tell the app where your decisions live.
3. Run **Scan project** for existing work, and optionally add the rule "Followed decisions are still current" to your Done transition.
4. Create or open a Jira work item and expand **Decision Drift Guard** in the details panel.

## Measured (development numbers, experimental check)
`node eval/run.mjs` runs the matcher on two sets of test work items against the 7 sample decisions. Set 1 (written before the matcher, then used for tuning): 24 of 24 paraphrases caught, 0 of 16 false flags. Set 2 (written after tuning, not tuned on): 13 of 16 caught, 2 of 16 false flags; 14 of 16 and 2 of 16 when decisions are free sentences only. The word-for-word check alone caught 0 of the paraphrases in either set. Both sets were written by the same AI that wrote the matcher.


## Field tests on third-party data (experimental check)
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
