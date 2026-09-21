---
"@cloudflare/containers-shared": minor
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Allow local Container images without exposed ports

Wrangler and the Cloudflare Vite plugin no longer reject images that omit Docker `EXPOSE` metadata. Local Containers can run command-only workloads or serve traffic through workerd without declaring an unused image port.
