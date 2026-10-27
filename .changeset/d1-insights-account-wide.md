---
"wrangler": minor
---

Allow the experimental `wrangler d1 insights` command to run across every D1 database in the account, and sort by query efficiency by default

The database name is now optional. With no name, the command returns the top queries across every D1 database in the account, and each result gains `databaseId` and `databaseName` fields. `databaseName` is `null` for databases that have since been deleted.

`--sort-by` gains an `efficiency` option, which is now the default: it sorts by most rows read, then fewest rows returned, so the most impacted databases and queries come first. Pass `--sort-by=time` for the previous ordering.
