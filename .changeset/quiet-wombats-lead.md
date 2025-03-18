---
"@cloudflare/vite-plugin": patch
---

Make `assets` field optional in the Worker config when using assets. At build time, assets are included if there is a client build.
