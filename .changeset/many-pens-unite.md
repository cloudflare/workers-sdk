---
"wrangler": patch
---

fix: display cause when local D1 migrations fail to apply

Previously, if `wrangler d1 migrations apply --local` failed, you'd see something like:

```
❌ Migration 0000_migration.sql failed with following Errors
┌──────────┐
│ Error    │
├──────────┤
│ D1_ERROR │
└──────────┘
```

We'll now show the SQLite error that caused the failure:

```
❌ Migration 0000_migration.sql failed with following Errors
┌───────────────────────────────────────────────┐
│ Error                                         │
├───────────────────────────────────────────────┤
│ Error: SqliteError: unknown database "public" │
└───────────────────────────────────────────────┘
```
