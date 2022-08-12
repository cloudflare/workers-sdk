---
"wrangler": patch
---

feat: download & initialize a wrangler project from dashboard worker

Added `wrangler init --from-dash <worker-name>`, which allows initializing a wrangler project from a pre-existing worker in the dashboard.

Resolves #1624
Discussion: #1623

Notes: `multiplart/form-data` parsing is [not currently supported in Undici](https://github.com/nodejs/undici/issues/974), so a temporary workaround to slice off top and bottom boundaries is in place.
