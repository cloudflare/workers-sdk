---
"@cloudflare/vite-plugin": minor
"@cloudflare/containers-shared": patch
"miniflare": minor
"wrangler": minor
---

Support Durable Object-managed named images in local development

Wrangler and the Vite plugin build or pull named images configured through Wrangler JSON or TOML and expose their local tags through the `ctx.container.images` runtime interface. Miniflare accepts workerd's native class-scoped named-image configuration.

Duplicate-tag cleanup stays inside one image repository and keeps every tag that is active in the current development session, including when those images have identical contents.

This extends the experimental Durable Object-managed Containers interface. Named images are opt-in. A container entry without an `images` map can still supply an image directly when starting a Container Instance.

`getPlatformProxy()` does not prepare local Container images and disables Container attachments.

The Cloudflare Vitest plugin does not support Containers.
