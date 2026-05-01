---
"wrangler": patch
"miniflare": patch
"create-cloudflare": patch
---

fix: store config in ~/.config/wrangler/ instead of the incorrectly-hidden ~/.config/.wrangler/ on Linux. Existing data is automatically migrated.
