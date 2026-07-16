---
"@cloudflare/workers-shared": minor
---

Emit customer Worker version IDs in Asset Worker analytics

Asset Worker request events can now include the customer Worker version UUID supplied by the assets pipeline. This enables analytics consumers to filter static asset metrics by the versions selected in the Workers dashboard without changing the existing Asset Worker service version field.
