---
"@cloudflare/deploy-helpers": patch
---

Preserve existing secret bindings during Worker deployments

Deployments now explicitly inherit unchanged secret bindings from the previous Worker version, including secrets that are not declared in the local configuration. Wrangler already preserved these secrets through backend compatibility behavior; this change makes that behavior explicit and consistent for other consumers of the deploy helpers.
