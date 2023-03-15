---
"wrangler": minor
---

feat: support external imports from `cloudflare:...` prefixed modules

Going forward Workers will be providing built-in modules (similar to `node:...`) that can be imported using the `cloudflare:...` prefix. This change adds support to the Wrangler bundler to mark these imports as external.
