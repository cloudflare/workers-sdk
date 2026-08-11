---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add `observability.metrics` configuration for Workers metrics export

Normal Wrangler deploys now validate metrics export destinations and reconcile the Worker together with its bound D1 databases and R2 buckets. Setting `observability.metrics.enabled` to `false` clears the configured resources, and `wrangler delete` cleans them up after deleting the Worker. Reconciliation failures warn without failing an otherwise successful Worker deployment.
