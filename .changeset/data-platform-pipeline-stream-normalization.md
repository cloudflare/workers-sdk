---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Normalize deprecated `pipeline` field to `stream` in pipeline bindings config

When `wrangler.json` uses the deprecated `pipeline` field in a pipelines binding, the value is now copied to `stream` and `pipeline` is removed during config validation. This eliminates the need for fallback logic across the codebase and ensures all downstream consumers see a consistent config shape.
