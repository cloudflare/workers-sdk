---
"wrangler": patch
---

fix: limit bulk delete API requests to batches of 5,000

The `kv:bulk delete` command now batches up delete requests in groups of 5,000,
displaying progress for each request.
