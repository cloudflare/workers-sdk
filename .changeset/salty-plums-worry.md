---
"@cloudflare/vite-plugin": patch
---

fix: track server restart in module scope

When using `@cloudflare/vite-plugin` with React Router, miniflare might be disposed during restart. This change makes sure to track when the dev server restart in module scope to avoid unexpected behavior.
