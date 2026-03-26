---
"@cloudflare/vitest-pool-workers": patch
---

fix: `runInDurableObject` now correctly returns redirect responses (3xx) from Durable Object callbacks instead of throwing "Expected callback for X" errors
