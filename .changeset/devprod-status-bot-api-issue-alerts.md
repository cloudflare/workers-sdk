---
"@cloudflare/devprod-status-bot": minor
---

Post a Chat alert when an issue is opened with the `api` label, or when the `api` label is added to an existing issue

Routes alerts to a new `API_ISSUES_WEBHOOK` so the team room watching the Workers SDK community channel gets realtime visibility into incoming api-tagged issues.
