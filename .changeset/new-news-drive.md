---
"wrangler": patch
---

fix: Ensure we don't mangle internal constructor names in the wrangler bundle when building with esbuild

Undici changed how they referenced `FormData`, which meant that when used in our bundle process, we were failing to upload `multipart/form-data` bodies. This affected `wrangler pages publish` and `wrangler publish`.
