---
"@cloudflare/vitest-pool-workers": patch
"miniflare": patch
---

`reset()` from `cloudflare:test` now resets ratelimit binding state between tests. Previously, `RATE_LIMITERS` bindings retained their in-memory bucket counts across test boundaries, causing later tests in the same file to see stale rate-limit exhaustion state.
