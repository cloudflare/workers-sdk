---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
---

Add local development helpers previously only available from `wrangler`

`@cloudflare/workers-utils` now exports `readConfig()` and a `@cloudflare/workers-utils/d1-splitter` entry point. `@cloudflare/deploy-helpers` now provides `@cloudflare/deploy-helpers/dev-vars`, `@cloudflare/deploy-helpers/miniflare-options` and `@cloudflare/deploy-helpers/pages-assets` entry points. These let the Vite and Vitest plugins share this behaviour with `wrangler` without depending on it.
