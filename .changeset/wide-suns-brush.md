---
"@cloudflare/containers-shared": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Users can now specify `constraints.tiers` for their container applications. `tier` will be deprecated in favor of `tiers`.
If left unset, we will default to `tiers: [1, 2]`. If both `tier` and `tiers` are set, only the value for `tiers` will be respected.
