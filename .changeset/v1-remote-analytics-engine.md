---
"@cloudflare/vite-plugin": minor
---

Support remote Analytics Engine bindings in Vite plugin v1

Set `remote: true` on an `analytics_engine_datasets` entry in `wrangler.jsonc` to send `writeDataPoint()` calls from local development and preview to the real dataset.
