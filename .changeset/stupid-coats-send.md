---
"@cloudflare/vite-plugin": patch
---

set `build.rollupOptions.platform: "neutral"` on rolldown-vite to prevent Rolldown's `node:module` based `require` polyfill from breaking the build.
