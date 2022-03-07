---
"wrangler": patch
---

fix: limit bulk put API requests to batches of 5,000

The `kv:bulk put` command now batches up put requests in groups of 5,000,
displaying progress for each request.
