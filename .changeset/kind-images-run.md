---
"@cloudflare/containers-shared": patch
"wrangler": minor
---

Support explicit named Container image selection in Wrangler local development

Wrangler builds or pulls named images configured through Wrangler JSON or TOML and exposes their local tags through `ctx.container.images`. Pass one of those references to `ctx.container.start({ image })` to select the image.

This extends the experimental Durable Object-managed Containers interface. Named images are opt-in and do not become the Container's default image. A Container without a default image must supply an image or full Container snapshot when starting.
