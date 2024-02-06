---
"wrangler": minor
---

feat: default `wrangler d1 execute` and `wrangler d1 migrations` commands to local mode first, to match `wrangler dev`

This PR defaults `wrangler d1 execute` and `wrangler d1 migrations` commands to use the local development environment provided by wrangler to match the default behaviour in `wrangler dev`.

BREAKING CHANGE: `wrangler d1 execute` and `wrangler d1 migrations` commands now default `--local` to `true`. When running `wrangler d1 execute` against a remote D1 database, you will need to provide the `--remote` flag.
