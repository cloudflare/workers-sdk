---
"@cloudflare/vite-plugin": patch
---

set `build.rollupOptions.platform: "neutral"` on rolldown-vite to prevent Rolldown's `node:module` based `require` polyfill to break build.
