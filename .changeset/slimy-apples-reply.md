---
"create-cloudflare": minor
---

feature: Add `getBindingsProxy` support to `nuxt` template via `nitro-cloudflare-dev` module.

The `nuxt` template now uses the default dev command from `create-nuxt` instead of using `wrangler pages dev` on build output in order to improve the developer workflow. `nitro-cloudflare-dev` is a nitro module that leverages `getBindingsProxy` and allows bindings to work in nitro commands.
