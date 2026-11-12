---
"@cloudflare/workers-utils": minor
---

Add `readD1Migrations()` and an `apply-d1-migrations` entry point for reading and applying D1 migrations

These move from the Vitest plugin so other tools can apply migrations the same way. `readD1Migrations()` is also available through a `d1-migrations` entry point. The `apply-d1-migrations` entry point has no Node.js imports, so it can run inside workerd, and it exports `applyD1Migrations()`, the default `d1_migrations` table name, and the query that creates that table. `applyD1Migrations()` also accepts the D1 binding from Miniflare's `getD1Database()` in Node.js.
