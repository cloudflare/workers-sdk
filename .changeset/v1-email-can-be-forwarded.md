---
"@cloudflare/vite-plugin": patch
---

Expose `canBeForwarded` when testing email handlers locally

Update Miniflare so incoming email messages delivered through the Vite development server expose `canBeForwarded: true`, matching production.
