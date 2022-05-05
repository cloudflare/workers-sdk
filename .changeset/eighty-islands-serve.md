---
"wrangler": patch
---

fix: fix isolate prewarm logic for `wrangler dev`

When calling `wrangler dev`, we make a request to a special URL that "prewarms" the isolate running our Worker so that we can attach devtools etc to it before actually making a request. We'd implemented it wrongly, and because we'd silenced its errors, we weren't catching it. This patch fixes the logic (based on wrangler 1.x's implementation) and enables logging errors when the prewarm request fails.

As a result, profiling starts working again as expected. Fixes https://github.com/cloudflare/wrangler2/issues/907
