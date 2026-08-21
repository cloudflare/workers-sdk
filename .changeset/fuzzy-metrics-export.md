---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-auth": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add `observability.metrics` configuration for Workers metrics export

Normal Wrangler deploys now validate metrics export destinations and reconcile the Worker together with its bound D1 databases and R2 buckets. Setting `observability.metrics.enabled` to `false` clears the configured resources, and `wrangler delete` cleans them up after deleting the Worker. Reconciliation failures warn without failing an otherwise successful Worker deployment.

Wrangler OAuth login now requests the `workers_observability:write` scope. Existing OAuth sessions must run `wrangler login` again, and API token users need the corresponding Workers Observability write permission.

Named environments inherit top-level metrics export settings when they do not define their own `observability` block. Wrangler warns when an environment-level `observability` block replaces top-level metrics settings without explicitly enabling or disabling metrics export.
