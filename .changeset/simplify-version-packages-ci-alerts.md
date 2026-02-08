---
"@cloudflare/devprod-status-bot": patch
---

Simplify Version Packages PR CI failure alerts

The bot now sends an alert for any failing CI job on the Version Packages PR, instead of first fetching the required status checks from GitHub's branch protection API and filtering. This removes unnecessary complexity and ensures all CI failures are reported.
