---
"@cloudflare/workers-shared": minor
---

Emit customer-facing Asset Worker request analytics separately

Asset Worker requests now write a separate customer-facing analytics event that includes the customer Worker version UUID supplied by the assets pipeline. This enables analytics consumers to filter static asset metrics by the versions selected in the Workers dashboard without exposing operational Asset Worker fields.
