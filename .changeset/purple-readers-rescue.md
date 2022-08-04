---
"wrangler": patch
---

fix: Pass `usageModel` to Miniflare in local dev

This allows Miniflare to dynamically update the external subrequest limit for Unbound workers.
