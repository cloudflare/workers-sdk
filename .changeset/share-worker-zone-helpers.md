---
"@cloudflare/workers-utils": minor
---

Export `getWorkerZone()` and `toApiComplianceRegion()`

`getWorkerZone()` returns the zone of a Worker's first domain or fetch trigger, which Miniflare names in the `CF-Worker` header of the Worker's outgoing requests. `toApiComplianceRegion()` converts a `cloudflare.config.ts` compliance region to the form Cloudflare's API takes. The Vite and Vitest plugins now share them instead of keeping their own copies.
