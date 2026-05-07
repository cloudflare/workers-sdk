---
"wrangler": minor
---

`wrangler dev` and other Miniflare-backed commands now run the local `workerd` runtime with `TZ=UTC` to match production

Previously, `wrangler dev` (and other commands that spin up Miniflare, such as `wrangler kv`, `wrangler d1`, `wrangler r2`, `wrangler check`) inherited the host machine's timezone, so `Date` and `Intl` APIs inside a Worker observed the developer's local timezone during local development but UTC in production. This caused subtle, hard-to-debug differences between local and deployed behaviour.

Local development now matches production. Code that previously relied on the host timezone during `wrangler dev` will need to either accept UTC (the production behaviour) or explicitly construct dates/formatters with the desired timezone.
