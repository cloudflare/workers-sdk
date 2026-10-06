---
"miniflare": patch
---

Prevent local D1 session bookmark errors from crashing the development server

Session bookmark lookup failures, including SQLite errors when another connection holds the database write lock, now reach the Worker as catchable `D1_ERROR`s. SQL execution and bookmark retrieval share a transaction, so a failed lookup rolls back the queries and retrying cannot duplicate their writes. This applies to local D1 through Miniflare, Wrangler, the Vite plugin, and the Vitest plugin.

Fixes https://github.com/cloudflare/workers-sdk/issues/14916
