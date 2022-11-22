---
"wrangler": patch
---

fix: make it possible to use a local db for d1 migrations

As of this change, wrangler's d1 migrations commands now accept `local` and `persist-to` as flags, so migrations can run against the local d1 db.
