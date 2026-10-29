---
"wrangler": minor
---

Add hidden `--jurisdiction` option to `wrangler kv namespace list`

This option lists only the KV namespaces in a specific jurisdiction (for example `us`, `eu`, or `fedramp`). It is experimental and currently gated to allow-listed accounts, so it is hidden from `--help` until the feature is generally available.
