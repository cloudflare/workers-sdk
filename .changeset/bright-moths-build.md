---
"@cloudflare/vite-plugin": minor
---

Support explicit named Container image selection in local development

The Vite plugin builds or pulls named images from Wrangler configuration and exposes their local tags through `ctx.container.images`. Pass one of those references to `ctx.container.start({ image })` to select the image.

This extends the experimental Durable Object-managed Containers interface.
