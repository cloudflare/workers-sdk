---
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Support Durable Object-managed named images in local development

Wrangler and the Vite plugin now build or pull the configured named images and expose their local tags through the real `ctx.container.images` runtime interface. Miniflare accepts workerd's native class-scoped named-image configuration.

This extends the experimental Durable Object-managed Containers interface. Named images remain explicit choices rather than becoming an implicit default, and entries without an `images` map can supply an image directly when starting a Container Instance.
