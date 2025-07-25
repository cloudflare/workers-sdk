---
"@cloudflare/vite-plugin": patch
---

fix: properly set the socket path that the container engine is listening on.

Previously, this was only picking up the value set in Wrangler config under `dev.containerEngine`, but this value can also be set from env vars or automatically read from the current docker context.
