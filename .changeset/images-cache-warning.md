---
"wrangler": patch
---

Warn when an Images binding is configured without Workers Cache enabled

`wrangler deploy` and `wrangler versions upload` now print a warning if your Worker has an `images` binding but `cache.enabled` is not set. Enabling Workers Cache lets Cloudflare cache transformed images at the edge, reducing Images usage.
