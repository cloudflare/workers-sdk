---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Fix container egress interception on arm64 Docker runtimes

Both `wrangler dev` and the Cloudflare Vite plugin no longer force the `proxy-everything` sidecar image to pull as `linux/amd64`, allowing Docker to select the native image from the multi-platform manifest. Set `MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM` to force a specific platform when needed.
