---
"@cloudflare/vite-plugin": patch
---

Stop denying `vite.config.*` files from Vite dev server access

This allows projects to access `vite.config.*` files during development when needed.
