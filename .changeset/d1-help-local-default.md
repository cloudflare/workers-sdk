---
"wrangler": patch
---

Show that `--local` is the default in D1 command help

`wrangler d1 execute`, `wrangler d1 export`, `wrangler d1 migrations apply` and `wrangler d1 migrations list` run against the local database unless `--remote` is passed, but their `--help` output did not say so. The `--local` flag description now ends with "(default)".
