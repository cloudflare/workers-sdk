---
"wrangler": patch
---

Fix `wrangler pages dev` ignoring config bindings in projects without a `package.json`

Previously, Pages local development could fail to apply bindings from Wrangler configuration when the project did not include a `package.json`. `pages dev` now passes the already-discovered configuration path into the dev runtime so bindings from `wrangler.json`, `wrangler.jsonc`, and `wrangler.toml` continue to be loaded correctly.
