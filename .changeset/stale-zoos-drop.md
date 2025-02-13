---
"@cloudflare/vite-plugin": minor
---

No longer call `next` in server middleware.

This is so that the Cloudflare plugin can override subsequent dev middleware for framework integrations.
