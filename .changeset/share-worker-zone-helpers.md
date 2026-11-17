---
"@cloudflare/workers-utils": minor
---

Export `getWorkerZone()` and `toApiComplianceRegion()`

`getWorkerZone()` returns the zone of a Worker's first route, taken from its domains or fetch triggers. `toApiComplianceRegion()` converts a `cloudflare.config.ts` compliance region to the form Cloudflare's API takes.
