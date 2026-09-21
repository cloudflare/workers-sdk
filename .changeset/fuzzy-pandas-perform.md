---
"@cloudflare/vite-plugin": patch
---

Preserve side-effect-only Node.js compatibility polyfills in Vite 8 builds

Vite 8 builds now retain global polyfills such as `Performance`, keeping build behavior aligned with development mode and Vite 7.
