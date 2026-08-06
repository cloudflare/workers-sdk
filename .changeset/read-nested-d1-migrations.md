---
"@cloudflare/vitest-pool-workers": patch
---

Read nested D1 migration layouts in Workers Vitest tests

`readD1Migrations()` now discovers `.sql` files below the migrations directory, including Drizzle-style `0001_name/migration.sql` layouts supported by Wrangler's `migrations_pattern`, so `applyD1Migrations()` can apply the same migrations during tests.
