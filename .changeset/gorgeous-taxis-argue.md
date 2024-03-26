---
"wrangler": patch
---

fix: fix `wrangler d1 migrations apply` to allow migrations that don't end in a semicolon

Prior to this PR, migrations such as: `SELECT 1` would fail with a nonsensical error about INSERTS: `✘ [ERROR] near "INSERT": syntax error at offset 199 [code: 7500]`

What was happening was that wrangler was injecting a statement at the end of the migration, to update the migrations table saying the query successfully executed.

To avoid this, this PR moves the statement to the start of the migration.
