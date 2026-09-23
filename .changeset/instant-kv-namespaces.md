---
"wrangler": minor
---

Add hidden `--mode` options to `wrangler kv namespace create` and `wrangler kv namespace list`

The options support creating and filtering Workers KV namespaces in Instant mode. Workers KV Instant is currently gated to entitled accounts, so the options are hidden from `--help` until the feature is generally available.
