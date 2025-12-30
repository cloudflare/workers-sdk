---
"@cloudflare/vitest-pool-workers": patch
---

Fix Durable Object storage causing SQLITE_CANTOPEN errors on repeated test runs

When running `vitest` multiple times in watch mode, Durable Object storage would fail with `SQLITE_CANTOPEN` errors. This happened because the storage reset function was deleting directories that workerd still had file handles to.

The fix preserves directory structure during storage reset, deleting only files while
keeping directories intact. This allows workerd to maintain valid handles to SQLite
database directories across test runs.
