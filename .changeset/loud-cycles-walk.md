---
"wrangler": patch
---

fix: make it possible to create a D1 database backed by the experimental backend, and make `d1 execute`'s batch size configurable

With this PR, users will be able to run `wrangler d1 create <NAME> --experimental` to create new D1 dbs that use an experimental backend. You can also run `wrangler d1 migrations apply <NAME> --experimental` to run migrations against an experimental database.

On top of that, both `wrangler d1 migrations apply <NAME> ` and `wrangler d1 execute <NAME>` now have a configurable `batch-size` flag, as the experimental backend can handle more than 10000 statements at a time.
