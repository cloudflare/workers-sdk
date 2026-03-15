---
"wrangler": patch
---

Support migration directories (multi-file migrations) for D1 migrations.

Allows a migration to be either a top-level `.sql` file or a directory whose name is the migration name and which contains one or more `.sql` files executed in deterministic order. Backwards compatible with single-file migrations.
