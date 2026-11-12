---
"@cloudflare/workers-utils": minor
---

Add `readD1Migrations()` and `applyD1Migrations()` for reading and applying D1 migrations

These move from the Vitest plugin so other tools apply migrations the same way. `readD1Migrations()` is available from the main and `d1-migrations` entry points and throws when the migrations directory is missing. `applyD1Migrations()` is available from the `apply-d1-migrations` entry point, which has no Node.js imports so it runs inside workerd, and it also accepts the D1 binding from Miniflare's `getD1Database()`.
