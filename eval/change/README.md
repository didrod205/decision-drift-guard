# Decision change tests

The rules live in `src/lib/change.js` (pure functions, no network). Two tests:

1. `node eval/change/test_change.mjs`: 21 fixed cases (statuses, sentence changes, punctuation-only edits, edits outside the decision, ADR status headings, link detection, determinism). Result on 2026-11-04: 21 passed, 0 failed.
2. Replay of real ADR history: `python3 history_fetch.py` (needs a GitHub token in /tmp/.gt_ddg2 and `status_scan.json` from `status_scan.py`) downloads every committed version of every ADR file in backstage/backstage `docs/architecture-decisions` (16 files, ref master) and cosmos/cosmos-sdk `docs/architecture` (63 files, ref main) into `versions/`; then `node replay.mjs` runs each consecutive pair through `compareVersions`. The version files themselves are not committed (Apache-2.0 text, re-downloadable); `versions.json` lists every commit used.
   - 723 pairs. Status text changed in 26 pairs (3 of them in template files); 5 moved into a retired state (Backstage ADR013 Superseded 2024-11-29; Cosmos ADR-010 and ADR-022 Superseded 2021-09-15, ADR-045 Abandoned 2022-05-20, ADR-047 Abandoned 2023-05-16).
   - Run 1 (`replay_result_run1.json`): 3 of 5 found (both ABANDONED missed), 0 false. "abandoned" was then added to the retired words, so run 2 is tuned on this data.
   - Run 2 (`replay_result.json`): 5 of 5, 0 false; 136 pairs text changed (49 of them from commits whose message mentions typos, formatting or links), 582 ignored.
3. `refs.json`: issues and pull requests that mention a retired ADR file after its retirement date (GitHub search, 2026-11-04). Backstage: 2 (#27984, a review on 2024-12-10 that links ADR013 as "best practice", and #35129, a docs clean-up). Cosmos: 38 mentions, titles only read, all documentation maintenance or dependency updates.

Source data: Backstage and Cosmos SDK, both Apache License 2.0 (https://github.com/backstage/backstage/blob/master/LICENSE, https://github.com/cosmos/cosmos-sdk/blob/main/LICENSE). Copyright their authors.

## v7 (2026-11-04): small fixes are ignored
New rule in `change.js` (`isTrivialEdit`): removed and added sentences are aligned word by word; the version is ignored when every difference is a misspelling (2 letters at most, words of 4+ letters, no digits, no modal, negation or choice words, no un/dis style negation pairs), a small grammar word added, dropped or swapped, a doubled word removed, re-wrapped lines or lists, or a changed link address. At most 2 fixes, or 1 in 10 words.
Tuned on this same replay (`replay_result_run3.json`, previous run kept as `replay_result_run2_v6.json`): text changed 136 to 97, ignored 582 to 621, retired 5 of 5 unchanged. All 39 pairs that moved were read by hand: each is a spelling, grammar, doubled-word or wrapping fix; none adds or removes a decision. 35 of them come from commits whose message matches `typo|spell|grammar|duplicate word|format|prettier|lint|whitespace|link`; of the 47 pairs with such messages, 12 still notify. Run: `DDG_HISTORY=<folder with versions/ and versions.json> OUT=replay_result_run3.json node replay.mjs`. Unit tests: 36 of 36.
