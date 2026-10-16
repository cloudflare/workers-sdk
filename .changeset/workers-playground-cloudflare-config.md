---
"@cloudflare/workers-playground": patch
---

Migrate Workers Playground to use `@cloudflare/vite-plugin` v2 beta and `cf`

A single `cloudflare.config.ts` file is now used for development and builds. `cf` is used in place of Wrangler for deployments.
