---
"wrangler": minor
---

Add `--jurisdiction` to `wrangler basin sql query`

Queries for a warehouse whose R2 bucket is in the `fedramp` jurisdiction must go to the FedRAMP Basin SQL endpoint, `api.fedramp.sql.cloudflarestorage.com`. You can now send them there with `--jurisdiction` (or `-J`):

`wrangler basin sql query --jurisdiction fedramp <warehouse> "<query>"`

Without the flag, queries still go to `api.sql.cloudflarestorage.com`. The `wrangler r2 sql query` alias accepts the flag too.
