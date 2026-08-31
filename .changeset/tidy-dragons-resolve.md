---
"@cloudflare/vite-plugin": patch
---

Resolve dependencies without browser-only exports when Node.js compatibility is enabled

This prevents packages such as AWS SDK v3 from loading browser-only subpath exports alongside their Node-compatible module implementation.
