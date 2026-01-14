---
"wrangler": patch
---

Improve the error message for `wrangler secret put` when using Worker versions or gradual deployments. `wrangler versions secret put` should be used instead, or ensure to deploy the latest version before using `wrangler secret put`. `wrangler secret put` alone will add the new secret to the latest version (possibly undeployed) and immediately deploy that which is usually not intended.
