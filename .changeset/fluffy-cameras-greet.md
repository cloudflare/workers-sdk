---
"wrangler": patch
---

Deprecate `wrangler route`, `wrangler route list`, and `wrangler route delete`

Users should instead modify their wrangler.toml or use the `--routes` flag when publishing
to manage routes.
