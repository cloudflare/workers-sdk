---
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Recover from missing Worker scripts after an interrupted first deploy

When the Workers API returns a service without a script, `wrangler deploy` uses the first-deploy flow instead of crashing. `wrangler versions upload` tells you to run `wrangler deploy` first.
