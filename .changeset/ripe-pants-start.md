---
"create-cloudflare": patch
---

Generate `app/env.d.ts` and `server/env.d.ts` for Nuxt applications

Previously, only a top-level `env.d.ts` was created, which meant server files didn't receive Cloudflare types. Now the CLI generates separate `app/env.d.ts` and `server/env.d.ts` files, both importing from a shared `_cloudflare/env.d.ts` to avoid duplication.

This ensures Cloudflare types are available in both app and server directories.
