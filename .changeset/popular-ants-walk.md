---
"wrangler": patch
---

chore: don't minify bundles

When errors in wrangler happen, it's hard to tell where the error is coming from in a minified bundle. This patch removes the minification. We still set `process.env.NODE_ENV = 'production'` in the bundle so we don't run dev-only paths in things like React.

This adds about 2 mb to the bundle, but imo it's worth it.
