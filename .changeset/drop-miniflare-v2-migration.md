---
"miniflare": major
---

Drop miniflare v2 storage migration

The `migrateDatabase()` helper that migrated KV, R2, and D1 SQLite databases from the miniflare v2/early-v3 storage layout to the current Durable Object-based layout has been removed. This migration path was introduced in 2023 and is no longer needed.
