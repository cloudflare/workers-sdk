---
"wrangler": minor
---

Add an experimental `--jurisdiction` option to `wrangler kv namespace create`

This option creates a KV namespace within a specific jurisdiction (for example `us`, `eu`, or `fedramp`), backing it with jurisdiction-scoped storage. It is experimental and currently gated to allow-listed accounts, so it is hidden from `--help` until the feature is generally available.
