---
"@cloudflare/vitest-pool-workers": patch
---

Update warning message when attempting to access exports not defined on the main worker

Previously this referred to the `SELF` worker, which is now a deprecated API in the Vitest integration.
