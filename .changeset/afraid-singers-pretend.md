---
"wrangler": patch
---

fix: number d1 migrations properly even if previous migrations aren't prefixed by a number

We expected d1 migration names to be "0001_migration-name.sql", but a user could manually create a migration that in this format like "init.sql". Subsequent migrations would be named "0NaN_migration-name.sql" - this fixes that bug.
