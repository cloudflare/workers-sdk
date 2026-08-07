---
"@cloudflare/vite-plugin": patch
---

Update dev and preview for Miniflare's config-based options

The Vite plugin now converts the Miniflare options it creates for dev and preview sessions to Miniflare's config-based `workers` shape.

Users should not expect to notice any changes.
