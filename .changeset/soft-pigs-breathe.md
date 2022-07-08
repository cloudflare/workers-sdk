---
"wrangler": patch
---

polish: adds an actionable message when a worker name isn't provided to tail/secret

Just a better error message when a Worker name isn't available for `wrangler secret` or `wrangler tail`.

Closes https://github.com/cloudflare/wrangler2/issues/1380
