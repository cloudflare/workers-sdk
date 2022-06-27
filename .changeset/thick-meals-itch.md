---
"wrangler": patch
---

feat: add support for CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL to authorise

This adds support for using the CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL env vars for authorising a user. This also adds support for CF_API_KEY + CF_EMAIL from wrangler 1, with a deprecation warning.
