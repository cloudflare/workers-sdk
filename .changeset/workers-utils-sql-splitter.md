---
"@cloudflare/workers-utils": minor
---

Add `splitSqlQuery()` and `normalizeSqlLineEndings()`

They're moved from Wrangler, and split a D1 SQL file into its statements, as Wrangler does when executing it.
