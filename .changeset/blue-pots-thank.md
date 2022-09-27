---
"wrangler": patch
---

fix: fails to publish due to empty migrations
After this change, `wrangler init --from-dash` will not attempt to add durable object migrations to `wrangler.toml` for Workers that don't have durable objects.

fixes #1854
