---
"miniflare": patch
"wrangler": patch
---

Reduce Wrangler and Miniflare bundle sizes by omitting unused Zod locales

Wrangler and Miniflare retain Zod's default English validation messages while excluding the unused aggregate collection of additional locales from their production bundles.
