---
"create-cloudflare": patch
---

feature: Add `getBindingsProxy` support to `qwik` template

The `qwik` template now uses `getBindingsProxy` for handling requests for bound resources
in dev. This allows projects to use `vite` for dev instead of `wrangler pages dev` on built output.
