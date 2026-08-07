---
"@cloudflare/workers-utils": patch
---

Report an invalid `queues.consumers` value as a configuration error instead of crashing

Previously, setting `queues.consumers` to something other than an array (for example `null` or a string) could crash Wrangler or produce a flood of confusing extra errors. You now get a single clear message telling you the field must be an array.
