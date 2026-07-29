---
"miniflare": patch
---

Surface recoverable SQLite errors from local D1's session commit token lookup as catchable `D1_ERROR`s instead of crashing `wrangler dev`

When another connection is writing to the same persisted local D1 database, SQLite can return a recoverable `SQLITE_BUSY` ("database is locked") error. Query failures were already surfaced to the Worker as catchable `D1_ERROR`s, but the session commit token lookup that runs after each query batch was not wrapped, so a `SQLITE_BUSY` raised there escaped as an uncaught internal error and took down the entire `wrangler dev` process (and, with multi-config dev, every hosted worker). That lookup is now wrapped in the same `D1Error` handling, so the Worker receives a normal, retryable query error and the dev server stays up.

Fixes https://github.com/cloudflare/workers-sdk/issues/14916
