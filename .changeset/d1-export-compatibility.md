---
"wrangler": minor
---

Add `--compatibility` flag to `wrangler d1 export`

You can now export a remote D1 database that contains virtual tables, such as FTS5 or R\*Tree tables:

`wrangler d1 export my-database --remote --output dump.sql --compatibility sqlite3_cli_only`

The flag sets `dump_options.compatibility` on the D1 export API. It accepts `d1` (the default) and `sqlite3_cli_only`. With `sqlite3_cli_only`, the dump matches the output of the `sqlite3 .dump` command, including virtual tables. D1 cannot import this dump. `sqlite3_cli_only` is only supported for remote exports.
