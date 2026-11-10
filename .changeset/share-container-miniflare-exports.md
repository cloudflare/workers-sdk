---
"@cloudflare/containers-shared": minor
---

Export `createMiniflareExports()` for native Cloudflare configuration

Internal consumers can now give Miniflare the Durable Object exports of parsed `cloudflare.config.ts` and Build Output configuration, with each Container name replaced by the runtime options of the Container's prepared images.
