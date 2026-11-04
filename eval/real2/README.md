# Matcher v4 on two sets of real ADRs: one used for tuning, one not

Matcher v4 (app commit 69aa4c4) adds, in code only (no LLM): rules from "use X" decisions (the chosen tool versus the options named in the decision with "instead of", "rather than", "over", an "Alternatives" or "Considered options" section, and a small fixed list of tools that compete for the same job: date libraries, state management, test runners, package managers, HTTP clients, bundlers, CSS-in-JS), reading the first decision sentence when a page has no "Decision" heading, "avoid", "should be avoided" and "stop using" as prohibitions, titles of pull requests linked to the work item, and a stricter rule for "Needs judgment" cards (text overlap of at least 25% and at least two shared words that no other decision uses).

`run_set.mjs` turns each ADR markdown file into a Confluence-like page (headings and paragraphs, code blocks removed) and lets the app's own parser read it. All ADRs are treated as active. Input per item = title + description (HTML comments removed). Code diffs are not read.

## Set A: Backstage (tuning set)
Same data and frozen labels as `../real/` (14 ADRs, 64 positives, 56 unrelated; https://github.com/backstage/backstage/tree/master/docs/architecture-decisions , Apache-2.0). This set was used to build and tune v4, so these numbers are development numbers, not a test.

| | v3 (run once, untuned) | v4 (tuned on this set) |
|---|---|---|
| ADRs read | 11 of 14 | 14 of 14 |
| Positives with an automatic comment for the right ADR | 0 of 64 | 2 of 64 (#3148 ADR006 React.SFC, #4967 ADR010 dayjs) |
| Positives where the right ADR showed at all (comment or card) | 10 of 64 | 4 of 64 |
| Positives with a wrong ADR commented | 0 | 0 |
| Unrelated items with an automatic comment | 1 of 56 | 1 of 56 (#30109 "Export default document collator", read as ADR003 default exports) |
| Unrelated items with any card | 19 of 56 | 7 of 56 |

The overlap cards carried no signal on this set: the right ADR's overlap score was never higher than wrong ADRs' scores, so the stricter card rule removes noise at the cost of the few right cards.

## Set B: Cosmos SDK (not used for tuning, run once)
- **Decisions:** 62 ADR files `adr-*.md` (60 ADR numbers; annexes share a number; template left out) from https://github.com/cosmos/cosmos-sdk/tree/main/docs/architecture at commit 377d8464005941a76b69187f6c60fce6e6c61548 (Apache License 2.0, https://github.com/cosmos/cosmos-sdk/blob/main/LICENSE). Copies in `adr/` unchanged.
- **Labels:** frozen before the run (`LABEL_RULE.md` written before reading any comment; `labels.json` md5 in `labels.md5`). GitHub search for issues and PRs whose comments contain "docs/architecture/adr" found 222 items. Each ADR-linking comment was read: **6 positives** (a comment links a specific ADR and says the change goes against it or that the ADR must change for it; evidence comment URL for each in `labels.json` and `candidates.json`), 29 neutral links, 4 links to another project's ADRs (Tendermint), and the rest were only quoted by an automated review bot in change summaries. Positives: #10570 and #13742 (ADR-028), #12182 (ADR-053), #12889 (ADR-059), #7771 (ADR-031), #17164 (ADR-064).
- **Unrelated:** 56 closed issues and PRs, 4 + 4 from each of the same seven months as set A, skipping any that mention an ADR (`negs2.py`, `negatives.json`). Nobody checked that they never touched an ADR.

| | v4 |
|---|---|
| Decisions read | 56 (ADR numbers 010, 016, 021, 022, 048 had no Decision heading and no sentence the parser reads as a decision) |
| Positives with an automatic comment for the right ADR | **0 of 6** |
| Positives where the right ADR showed at all | **0 of 6** |
| Unrelated items with an automatic comment | **0 of 56** |
| Unrelated items with any card | **5 of 56** |

Why (facts from the data): the Cosmos ADRs are protocol and module designs (addresses, store layout, message services), not "use X" or "never Y" rules about tools, so neither the prohibition rules nor the competing-tool list apply; 2 of the 6 conflicts were raised in inline code review and the others are about how the code is structured. Six positives is a small set; the result says the matcher does not transfer to this kind of ADR, not a rate.

## Reproduce
Set A: `cd ../real && node ../real2/run_set.mjs . adr https://github.com/backstage/backstage/blob/master/docs/architecture-decisions/ '^adr(0(?:0[2-9]|1[0-5]))' out.json`. Set B: `python3 collect2.py`, `python3 negs2.py` (GitHub token needed), `python3 labels2.py`, then `node run_set.mjs . adr https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/ '^adr-(\d{3})' result_real2.json`. Issue and PR texts are not committed.
