# Decision Drift Guard: Privacy Policy

Effective date: 2026-11-04 (updated the same day for version 3: settings, audit trail, sample data). Publisher: E:LAB STUDIO (Kyoungchan Yang), Seoul, Republic of Korea. Contact: hello@elab-studio.com

Decision Drift Guard is an Atlassian Forge app. It runs entirely on Atlassian's Forge platform.

- **What it reads:** the summary, description and labels of the Jira work item being checked, and Confluence pages that the app's settings mark as decision records on the same site (labelled pages, Decision template pages, pages with inline decisions in the chosen spaces, title matches).
- **What it writes:** a Jira comment and the label `decision-drift` (or `decision-drift-possible`) when a new work item conflicts or possibly conflicts with a recorded decision; sample decision pages and work items only when an admin clicks Create sample data; a Confluence footer comment and the Jira label `decision-reopen-requested` when a user asks to reopen a decision. It never edits a decision page.
- **What it stores:** in Forge key-value storage on Atlassian: the app settings, and an audit trail of flags and reopen requests (work item key, decision title and link, the quoted evidence text, the reopen reason, dates). No external servers; no data leaves the Atlassian platform (no egress).
- **AI:** the automatic and in-panel checks are plain code. The optional Rovo agent runs on Atlassian Rovo under your site's Rovo settings; the app does not send data to any other AI service.
- **Personal data:** the app does not store account IDs. Quoted evidence and reopen reasons are copied from work item text and could contain whatever people wrote there. Because this text is kept for longer than 24 hours, the app's personal data declaration in the Atlassian developer console is "Yes".
- **Removal:** uninstalling the app stops all processing; Forge storage is deleted by Atlassian according to its app data retention rules. Comments and labels it added remain in your site like any user-created content and can be deleted there.

Questions: hello@elab-studio.com

## Added in version 4 (decision changed)
The app also stores, in Forge storage on Atlassian: links between work item keys and Confluence page ids (with page title, URL, how and when the link was made), and one record per changed decision page version (statuses, up to six removed and six added sentences quoted from the decision page, the work item keys commented). No account IDs are stored. Page versions are read only to compare them; no copy of a page is kept.
