---
"wrangler": minor
---

The `wrangler types` command now attempts to infer Queue binding message types from secondary worker configurations, similar to how Durable Objects and Worker Entrypoints are handled. When a queue consumer is found in the secondary worker config, the type generation will attempt to provide more specific typing information instead of always using `Queue<unknown>`.
