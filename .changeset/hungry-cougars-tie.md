---
"wrangler": minor
---

feat: default `wrangler d1 execute` to local mode first, to match `wrangler dev`

This PR defaults `wrangler d1 execute` to use the local development environment provided by wrangler to match the default behaviour in `wrangler dev`.

BREAKING CHANGE: `wrangler d1 execute` now defaults `--local` to `true`. When running `wrangler d1 execute` against a remote D1 database, you will need to provide the `--remote` flag.
