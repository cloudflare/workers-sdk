---
"wrangler": patch
---

Fix D1 migrations to discover nested SQL files

`wrangler d1 migrations list` and `wrangler d1 migrations apply` now recursively discover `.sql` files under `migrations_dir`. Nested migrations are recorded by their relative path, so layouts like `migrations/20240501120000_initial/migration.sql` can be applied without colliding with other `migration.sql` files. `wrangler d1 migrations create` also accounts for nested migration prefixes when choosing the next migration number.
