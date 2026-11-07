---
"@cloudflare/vite-plugin": patch
---

Update the local development runtime to the November 6 release

Update Miniflare and the coupled Wrangler and shared dependencies. Remote binding preview uploads avoid materializing unused multipart request bodies, reducing memory use during session creation.

The runtime includes session-scoped cleanup of local Container resources and security fixes for bundled dependencies. Node.js 22.12.0 or later is required by the updated runtime.
