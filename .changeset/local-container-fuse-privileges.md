---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
---

Enable FUSE-capable local container development

Miniflare now automatically passes the Docker privileges needed for FUSE to local Durable Object containers when using local rootless Docker on Linux with `/dev/fuse` available, or a local Docker engine on macOS or through WSL where Linux containers run in a VM. This applies to Wrangler, the Cloudflare Vite plugin, and direct Miniflare use.
