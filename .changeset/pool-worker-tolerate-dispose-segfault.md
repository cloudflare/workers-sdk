---
"@cloudflare/vitest-pool-workers": patch
---

Prevent worker disposal errors from failing otherwise successful test runs

Errors raised while disposing test Workers are now logged for diagnostics rather than overriding the test result. Set `NODE_DEBUG=vitest-pool-workers` to view these errors.
