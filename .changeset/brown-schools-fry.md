---
"wrangler": patch
---

Remove `--use-remote` option from `wrangler hyperdrive create` command

Hyperdrive does not support remote bindings during local development - it requires a `localConnectionString` to connect to a local database. This change removes the confusing "remote resource" prompt that was shown when creating a Hyperdrive config.

Fixes #11674
