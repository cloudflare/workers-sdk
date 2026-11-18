---
"@cloudflare/deploy-helpers": minor
---

Add local development helpers previously only available from `wrangler`

`@cloudflare/deploy-helpers` now provides `@cloudflare/deploy-helpers/dev-vars`, `@cloudflare/deploy-helpers/miniflare-options` and `@cloudflare/deploy-helpers/pages-assets` entry points. With these, the Vitest plugin shares this behaviour with `wrangler` without depending on it.
