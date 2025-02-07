---
"miniflare": patch
"wrangler": patch
---

fix: add support for workers with assets when running multiple workers in one `wrangler dev` instance

https://github.com/cloudflare/workers-sdk/pull/7251 added support for running multiple Workers in one `wrangler dev`/miniflare session. e.g. `wrangler dev -c wrangler.toml -c ../worker2/wrangler.toml`, which among other things, allowed cross-service RPC to Durable Objects.

However this did not work in the same way as production when there was a Worker with assets - this PR should fix that.
