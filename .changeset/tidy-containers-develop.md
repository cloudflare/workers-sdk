---
"wrangler": minor
---

Support Durable Object-managed Container images in local development

`wrangler dev` now builds or pulls every named image configured on an experimental `scheduling_policy: "durable_object"` Container, exposes their local tags through `EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES`, and attaches the Container capability to its Durable Object. Calls to `ctx.container.start({ image })` can select among those images locally; Wrangler uses the first configured image as the Miniflare attachment so same-session container snapshot restores have a concrete fallback image.
