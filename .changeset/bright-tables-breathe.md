---
"@cloudflare/vite-plugin": patch
---

Preserve the server origin when constructing Worker request URLs

HTTP requests, WebSocket upgrades, and static routing now consistently treat incoming paths as paths on the selected server origin in dev and preview. Encoded paths and query strings are preserved, and non-origin-form request targets are rejected.
