---
"wrangler": minor
"miniflare": minor
---

Enable FUSE-capable local container development

Wrangler now passes the Docker privileges needed for FUSE to local Durable Object containers when it is safe to do so. Privileges are enabled on non-Linux hosts and rootless Docker on Linux, and disabled with a warning on native rootful Docker for Linux.
