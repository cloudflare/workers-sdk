---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add Stream binding support to Wrangler and workers-utils

Wrangler and workers-utils now recognize the `stream` binding in configuration, deployment metadata, and generated worker types. This enables projects to declare Stream bindings in `wrangler.json` and have the binding represented consistently across validation, metadata mapping, and type generation.
