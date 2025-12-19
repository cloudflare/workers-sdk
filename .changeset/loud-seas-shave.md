---
"wrangler": patch
---

Fix arguments passed to `wrangler deploy` not being forwarded to `opennextjs-cloudflare deploy`

`wrangler deploy` run in an open-next project delegates to `opennextjs-cloudflare deploy`, as part of this all the arguments passed to `wrangler deploy` need be forwarded to `opennextjs-cloudflare deploy`, before the arguments would be lost, now they will be successfully forwarded (for example `wrangler deploy --keep-vars` will call `opennextjs-cloudflare deploy --keep-vars`)
