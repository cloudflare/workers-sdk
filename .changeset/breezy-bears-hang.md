---
"@cloudflare/pages-shared": patch
"wrangler": patch
---

fix: `wrangler dev --local` now correctly lazy-imports `@miniflare/tre`

Previously, we introduced a bug where we were incorrectly requiring `@miniflare/tre`, even when not using the `workerd`/`--experimental-local` mode.
