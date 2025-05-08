---
"wrangler": patch
---

Rename the `Cloudflare` namespace (not user-facing) in generated types to `CF` to prevent conflicts with the `Cloudflare` global when both generated types and @cloudflare/workers-types existed.
