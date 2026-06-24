---
"wrangler": patch
"@cloudflare/vitest-pool-workers": patch
---

fix(d1): escape `migrationsTableName` and filenames in SQLite queries

D1 migration commands in both `wrangler` and `@cloudflare/vitest-pool-workers` interpolated the `migrationsTableName` config value and migration filenames directly into SQL strings without any escaping. This meant:

- A table name such as `my"table` would produce invalid SQL in `CREATE TABLE`, `SELECT`, and `INSERT` statements, and
- A migration filename containing an apostrophe (e.g. `what's-new.sql`) would break the `INSERT INTO ... VALUES ('...')` statement appended after each migration in `wrangler`.

Both identifiers are now properly escaped before interpolation: `migrationsTableName` is wrapped in double-quotes with internal double-quotes doubled (SQL-standard identifier quoting), and migration filenames used as string literals have their single-quotes doubled before insertion.
