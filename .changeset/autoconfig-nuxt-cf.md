---
"@cloudflare/autoconfig": minor
---

Support Nuxt on `cf` from version 4.7.0

Autoconfig now sets up Nuxt projects for `cf` with Nuxt's Vite server builder and the Cloudflare Vite plugin. Projects configured for Wrangler keep using Nitro's Cloudflare preset.

Nuxt's Vite server builder is experimental and brings no server runtime of its own, so it doesn't run `server/` routes or middleware. Nuxt warns about this when building.
