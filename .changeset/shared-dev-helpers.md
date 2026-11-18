---
"@cloudflare/dev-helpers": minor
---

Add local development helpers previously only available from `wrangler`

`@cloudflare/dev-helpers` now provides `@cloudflare/dev-helpers/dev-vars`, `@cloudflare/dev-helpers/miniflare-options` and `@cloudflare/dev-helpers/pages-assets` entry points. With these, the Vitest plugin shares this behaviour with `wrangler` without depending on it.
