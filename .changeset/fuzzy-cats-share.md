---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Use the configured container engine for local Docker operations

Container image builds, pulls, inspection, rebuilds, and cleanup now use the same Docker endpoint as the local workerd runtime. Multi-Worker Vite and Wrangler sessions now report conflicting endpoints.
