---
"miniflare": patch
---

Fix local rate limit counters silently resetting after ~10s of inactivity

The emulated Ratelimit binding kept its counters on the JS heap of an internal Durable Object. `workerd` evicts idle Durable Objects after around 10 seconds, taking the counters with them, so in `wrangler dev` you could hit your Worker, pause to look at something, and find your limit had silently reset part way through the window.

Counters now live in the Durable Object's storage, which survives eviction. They are still cleared by `deleteAllDurableObjects()`, so `reset()` from `@cloudflare/vitest-pool-workers` continues to reset rate limit state between tests, exactly as it does for KV, R2 and D1. Counters are now also written to the persistence directory, so they survive a `wrangler dev` restart within the same window.
