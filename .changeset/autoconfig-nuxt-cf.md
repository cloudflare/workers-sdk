---
"@cloudflare/autoconfig": minor
---

Support Nuxt on `cf` from version 4.7.0

Autoconfig now sets up Nuxt projects for `cf` with Nuxt's Vite server builder and the Cloudflare Vite plugin. Projects configured for Wrangler keep using Nitro's Cloudflare preset.

On `cf`, Nuxt's Vite server builder doesn't run `server/` routes or middleware, and Nuxt warns about this when building.
