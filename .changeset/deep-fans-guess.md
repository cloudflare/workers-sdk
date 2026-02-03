---
"@cloudflare/devprod-status-bot": minor
---

Send alert to ANT: Alerts chat on failed CI checks in Version Packages PRs

When a required CI check fails or times out on the Version Packages PR (`changeset-release/main` branch), an alert is now sent to the ANT: Alerts Google Chat channel. This helps the team quickly identify and address CI failures that shouldn't occur since individual PRs have already passed before landing on main.

Alerts for the same PR are grouped into the same chat thread using the PR number as the thread ID.
