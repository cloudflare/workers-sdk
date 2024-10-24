---
"wrangler": patch
---

refactor: use same param parsing code for `wrangler hyperdrive create` and `wrangler hyperdrive update`

ensures that going forward, both commands support the same features and have the same names for config flags
