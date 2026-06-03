---
"wrangler": patch
---

Limit `wrangler versions list` to the 10 most recent deployable versions

The versions API ignores pagination when filtering to deployable versions, so Wrangler now caps the command output client-side. This keeps the command aligned with its help text and avoids overwhelming terminal output for Workers with many versions.
