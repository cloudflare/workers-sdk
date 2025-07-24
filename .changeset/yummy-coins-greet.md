---
"@cloudflare/vite-plugin": patch
---

fix: properly set the docker socket path in the vite plugin

Previously, this was only picking up the value set in Wrangler config under `dev.containerEngine`, but this value can also be set from env vars or automatically read from the current docker context.
