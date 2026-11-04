# Labelling rule for the second field test (written 2026-11-04 before reading any candidate comment)

Matcher frozen before collection: app commit 69aa4c4 (match.js md5 859990d05b737b4d943956bd94217504, core.js md5 3d7c443e4902aebe6e18ae76781ebc71). Later commit fe35d43 only hides an "Unknown" status label in the comment and panel; matcher code unchanged.

Project: cosmos/cosmos-sdk (Apache License 2.0), ADRs in docs/architecture/adr-*.md (63 files at commit 377d8464005941a76b69187f6c60fce6e6c61548). Not used for any tuning.

Candidates: every issue and pull request whose comments (issue comments, review comments, review bodies) contain "docs/architecture/adr" (GitHub search, in:comments).

Positive: a comment on the item links a specific ADR and says the change goes against it, does not follow it, or argues the ADR's rule should change for this work. Same rule as the Backstage set.
Excluded (neutral): the link explains, answers a question, points to background reading, says the work follows or implements the ADR, adds or edits an ADR, or the reviewer is unsure.
No specific ADR: the link points to the folder or an index, not one ADR.

Unrelated sample: closed issues and PRs, 4 + 4 from each of the same seven months as the Backstage set (2020-11, 2021-04, 2021-09, 2022-03, 2023-05, 2024-09, 2025-06), skipping any that mention an ADR or docs/architecture, or are candidates.

Matcher input: title + description (HTML comments removed), all ADRs active, no "Do not" rows. The run happens once; results are reported as they come out.
