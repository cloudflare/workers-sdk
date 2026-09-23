---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Prepare the required egress sidecar for local Containers without configured images

Wrangler dev and Vite dev/preview now pull the required sidecar for Durable Object-managed Containers that select their application image at start time. Previously, these Containers failed to start unless the sidecar image was already cached in Docker.
