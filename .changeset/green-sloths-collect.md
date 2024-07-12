---
"wrangler": patch
---

fix: teach wrangler init --from-dash about d1 bindings

This PR teaches `wrangler init --from-dash` about D1 bindings, so they aren't incorrectly added to the wrangler.toml as unsafe bindings.
