---
"@cloudflare/containers-shared": patch
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Users can now specify `constraints.tiers` for their container applications. `tier` is deprecated in favor of `tiers`.
If left unset, we will default to `tiers: [1, 2]`.
Note that `constraints` is an experimental feature.
