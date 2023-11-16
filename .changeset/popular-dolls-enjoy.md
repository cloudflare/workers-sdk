---
"create-cloudflare": patch
---

fix: update Nuxt template to work on Windows

Rather than relying upon the non-Windows shell syntax to specify an environment variable,
we now update the `nuxt.config.ts` files to include the cloudflare preset.

Fixes #4285
