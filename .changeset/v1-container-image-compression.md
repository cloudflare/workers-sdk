---
"@cloudflare/vite-plugin": minor
---

Support opting into zstd compression for local Container image builds in v1

Update the container build helper so `WRANGLER_CONTAINER_IMAGE_COMPRESSION=zstd` applies when the Vite plugin prepares Dockerfile-based Container images. Docker must use the containerd image store; the default build behavior is unchanged.
