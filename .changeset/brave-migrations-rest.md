---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Fail `wrangler versions upload` early when a Worker has a pending Durable Object migration

Wrangler now directs users to run `wrangler deploy` to apply the migration instead of sending a version upload request that the API will reject.
