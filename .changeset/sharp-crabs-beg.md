---
"@cloudflare/workers-shared": patch
---

Dummy workers-shared version bump

The Router Worker and Asset Worker of `workers-shared` are currently in a weird state that prevents us to redeploy them. The current versions of these workers are developer modified due to adding secrets. We want a CI controlled version to safely use these secrets.

This commit performs a dummy `workers-shared` version bump to unlock us from this blocked state.
