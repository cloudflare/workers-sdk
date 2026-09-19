---
"wrangler": patch
---

Fix the D1 SQL statement splitter under-splitting migration files that contain a `CASE ... END` expression whose `END` is immediately followed by a comma or closing paren rather than whitespace

Previously, such a file would be applied as one oversized statement instead of being split correctly, which could fail partway through with a confusing error.

For `wrangler d1 migrations apply --local`, this could surface as a confusing `database table is locked: SQLITE_LOCKED` error partway through a migration, with the same file applying cleanly with `--remote`.
