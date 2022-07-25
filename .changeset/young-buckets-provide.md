---
"wrangler": patch
---

feat: source maps support in `wrangler dev` remote mode

Previously stack traces from runtime errors in `wrangler dev` remote mode, would give unhelpful stack traces from the bundled build that was sent to the server. Here, we use source maps generated as part of bundling to provide better stack traces for errors, referencing the unbundled files.

Resolves https://github.com/cloudflare/wrangler2/issues/1509
