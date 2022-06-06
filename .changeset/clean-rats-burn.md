---
"wrangler": patch
---

fix: batch sites uploads in groups under 100mb

There's an upper limit on the size of an upload to the bulk kv put api (as specified in https://api.cloudflare.com/#workers-kv-namespace-write-multiple-key-value-pairs). This patch batches sites uploads staying under the 100mb limit.

Fixes https://github.com/cloudflare/wrangler2/issues/1187
