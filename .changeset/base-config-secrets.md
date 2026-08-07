---
"wrangler": minor
---

Add Preview base config secret commands

Wrangler now manages Worker Preview base config secrets with `wrangler preview base-config secret put`, `delete`, `list`, and `bulk`. These commands update the Worker's `previews_base_config.env`, keeping shared defaults scoped to all of that Worker's Previews. `wrangler preview base-config secret list` reads from the Worker's Preview base config and prints secret names with values masked. `wrangler preview base-config secret bulk` deletes a secret when its value is `null`, matching `wrangler secret bulk`.
