---
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

fix: store config in ~/.config/wrangler/ instead of the incorrectly-hidden ~/.config/.wrangler/. Existing data is automatically migrated.
