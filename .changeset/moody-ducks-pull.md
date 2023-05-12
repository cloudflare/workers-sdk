---
"wrangler": major
---

feature: enable persistent storage in local mode by default

Wrangler will now persist local KV, R2, D1, Cache and Durable Object data
in the `.wrangler` folder, by default, between reloads. This persistence
directory can be customised with the `--persist-to` flag. The `--persist` flag
has been removed, as this is now the default behaviour.
