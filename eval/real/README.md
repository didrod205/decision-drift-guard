# Field test on third-party data: Backstage ADRs vs. real GitHub issues and pull requests

Run once on 2026-11-04, matcher unchanged (app/src/lib at commit ce5f41d), no tuning before or after.

## Data
- **Decisions:** the 14 Architecture Decision Records ADR002 to ADR015 of the open source Backstage project, https://github.com/backstage/backstage/tree/master/docs/architecture-decisions (Copyright The Backstage Authors, Apache License 2.0, https://github.com/backstage/backstage/blob/master/LICENSE). ADR000 (template) and ADR001 (the ADR process itself) are left out. Copies are in `adr/` unchanged. For the run, the text under each ADR's "## Decision" heading (prose only: code blocks and link targets removed) became one decision page, all marked active (ADR013 is superseded today, but it was in force when reviewers cited it). No "Do not" rows were added.
- **Items with a human label:** GitHub search for issues and pull requests in backstage/backstage whose comments contain `architecture-decisions` (92 items, `candidates.json`). Each comment that links an ADR was read. **Positive (64)** = a comment on the item links a specific ADR and says the change goes against it or that the rule should change (examples: https://github.com/backstage/backstage/pull/7174#discussion_r712516491 "we are adamantly working to get rid of `moment` actually, see ... adr010", https://github.com/backstage/backstage/pull/3148 "Actually - none of them! ... adr006-avoid-react-fc"). **Excluded (14)** = the link was neutral (answer to a question, docs link, error log text, reviewer unsure). 14 items linked no specific ADR. Labels were frozen in `labels.json` before the run (md5 in `labels.md5`).
- **Unrelated items (56):** closed issues and pull requests from seven months between 2020-11 and 2025-06 (4 issues and 4 PRs each), skipping any that mention an ADR (`negatives.json`). Caveat: nobody checked that these never touched an ADR; "unrelated" means no comment linked one.
- Input to the matcher = title + description (HTML comments removed), as a new Jira work item would carry. Code diffs are not read.

## Result (`result_real.json`)
| | count |
|---|---|
| Decisions parsed | 11 of 14 (ADR002, ADR008, ADR009 have no "Decision" heading, so nothing was read) |
| Positives that got an automatic comment (Conflict or Possible conflict) with the right ADR | **0 of 64** |
| Positives where the right ADR at least appeared as a "Needs judgment" card in the panel | **10 of 64** |
| Positives with a wrong ADR flagged | 0 of 64 |
| Unrelated items that got an automatic comment | **1 of 56** (#9874, Possible conflict with ADR015) |
| Unrelated items that showed any card | 19 of 56 |

## Why it missed (facts from the data, not tuned)
1. In 54 of the 64 positives every ADR-linking comment is an inline code-review comment (`#discussion_r...`): the drift was in the diff, not in the title or description the app reads.
2. Backstage ADRs mostly state a positive choice ("We will use Luxon as the standard date library"); the matcher builds rules from prohibitions ("never", "do not", "Do not" rows) and an agreed alternative, so "use X" decisions give it no rule to break.
3. Three ADRs use their own headings instead of "Decision".
4. The concept table was written for the sample domain (payments, sign-in, analytics, offline), not for front-end libraries.

## Reproduce
`python3 collect.py` (GitHub token needed for the search API), `python3 labels.py`, then `node run_real.mjs`. The issue and PR texts are not committed; `collect.py` and the negative-sample code in the notes re-download them.
