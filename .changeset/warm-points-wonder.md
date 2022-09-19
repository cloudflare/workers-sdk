---
"wrangler": patch
---

fix: potential missing compatibility_date in wrangler.toml when running `wrangler init --from-dash`
Fixed a bug where compatibility_date wasn't being added to wrangler.toml when initializing a worker via `wrangler init --from-dash`

fixes #1855
