---
"create-cloudflare": patch
---

Fix Docusaurus project creation with pnpm's strict build approvals

Defer dependency installation until C3 has written its build approvals. This also lets C3's approval and retry flow handle build scripts required by Docusaurus dependencies.
