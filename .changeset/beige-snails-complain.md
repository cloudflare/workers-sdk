---
"wrangler": patch
---

fix(wrangler): do not login or read wrangler.toml when applying D1 migrations in local mode.

When applying D1 migrations to a deployed database, it is important that we are logged in
and that we have the database ID from the wrangler.toml.
This is not needed for `--local` mode where we are just writing to a local SQLite file.
