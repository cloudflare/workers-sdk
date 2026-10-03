---
"@cloudflare/vite-plugin": patch
---

Fix Vitest failing to start when the Vite config includes the Cloudflare plugin

Vitest now runs tests instead of failing with "There is already a server associated with the config." at startup. Container cleanup continues to work across dev server restarts.
