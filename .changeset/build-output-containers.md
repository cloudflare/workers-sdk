---
"@cloudflare/containers-shared": patch
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Build Containers when emitting experimental Build Output

Wrangler and the Cloudflare Vite plugin now build Dockerfile-backed Container images when experimental Build Output is enabled. Container configs are emitted under `.cloudflare/output/v0/containers` with local image references, while existing registry references pass through unchanged.
