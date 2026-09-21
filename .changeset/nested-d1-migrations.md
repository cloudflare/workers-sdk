---
"@cloudflare/vitest-plugin": minor
"@cloudflare/workers-utils": patch
---

Support nested D1 migration layouts in `readD1Migrations()`

`readD1Migrations()` now accepts the same `migrationsDir` / `migrationsPattern` options Wrangler uses, so Vitest can apply Drizzle-style nested files such as `0001_init/migration.sql`. Discovery is shared with Wrangler via `@cloudflare/workers-utils`, so the test path and `wrangler d1 migrations apply` stay aligned.

The original `readD1Migrations(migrationsPath)` signature still reads only top-level `*.sql` files in that directory.
