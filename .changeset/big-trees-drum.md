---
"@cloudflare/vite-plugin": patch
---

Replace assertion in vite-plugin-cloudflare:nodejs-compat plugin transform hook with early return. This prevents an error from being logged when building with React Router and TailwindCSS.
