---
"wrangler": patch
---

Closes [#1505](https://github.com/cloudflare/wrangler2/issues/1505) by extending `wrangler tail` to allow for passing worker routes as well as worker script names.

For example, if you have a worker `example-worker` assigned to the route `example.com/*`, you can retrieve it's logs by running either `wrangler tail example.com/*` or `wrangler tail example-worker`—previously only `wrangler tail example-worker` was supported.
